const { pool, withTransaction } = require('../config/db');
const { issueOtp, verifyOtp } = require('../utils/helpers');

// ADMIN GATEWAY CONSOLE (admin-only): admin khud JazzCash/Easypaisa mobile
// account se paise cut kar sakta hai — same OTP/SMS flow (code mobile account
// par jata hai, admin us OTP se authorize karta hai).
// Ye simulated bank/mobile-operator side hai: provider_wallets = real balances.

// All mobile accounts + real balances (Provider Accounts tab ka "real detail")
async function listWallets() {
  const [rows] = await pool.query(
    `SELECT pw.*,
            (SELECT COUNT(DISTINCT pa.user_id) FROM provider_accounts pa WHERE pa.provider = pw.provider AND pa.account_number = pw.account_number) AS linked_users
     FROM provider_wallets pw ORDER BY pw.balance DESC, pw.id ASC`
  );
  const [[s]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN provider = 'jazzcash' THEN balance END),0) AS jazzcash_total,
            COALESCE(SUM(CASE WHEN provider = 'easypaisa' THEN balance END),0) AS easypaisa_total,
            COUNT(*) AS accounts
     FROM provider_wallets`
  );
  return { rows, summary: s };
}

// Mini statement of a real mobile account
async function walletStatement(id) {
  const [wallet] = await pool.query(`SELECT * FROM provider_wallets WHERE id = ?`, [id]);
  if (!wallet.length) throw Object.assign(new Error('Provider account not found'), { status: 404 });
  const [txns] = await pool.query(
    `SELECT * FROM provider_wallet_transactions WHERE provider_wallet_id = ? ORDER BY id DESC LIMIT 50`,
    [id]
  );
  return { account: wallet[0], transactions: txns };
}

// (Dev helper) mobile account ko credit do — "user ne JazzCash app mein balance dala"
async function adminCredit({ provider, account_number, amount, note }) {
  const amt = Number(amount);
  if (!(amt > 0)) throw Object.assign(new Error('Amount must be positive'), { status: 400 });
  if (!/^03\d{9}$/.test(String(account_number))) throw Object.assign(new Error('Valid mobile number required (03XXXXXXXXX)'), { status: 400 });
  const title = `Mobile account ${account_number}`;
  await pool.query(
    `INSERT INTO provider_wallets (provider, account_number, account_title, balance) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance), account_title = COALESCE(account_title, VALUES(account_title))`,
    [provider, account_number, title, amt]
  );
  const [w] = await pool.query(`SELECT * FROM provider_wallets WHERE provider = ? AND account_number = ?`, [provider, account_number]);
  await pool.query(
    `INSERT INTO provider_wallet_transactions (provider_wallet_id, direction, amount, reference, balance_after, note)
     VALUES (?, 'credit', ?, ?, ?, ?)`,
    [w[0].id, amt, `ADMC-${Date.now()}`, w[0].balance, note || 'Simulated mobile-app top-up (dev)']
  );
  return { ok: true, balance: w[0].balance };
}

// ---- Admin OTP cut flow (same as user topup, admin authorized) ----
// 1. initiate: pending transaction row (provider_accounts ledger + audit)
async function initiateCut({ provider, account_number, amount, note }) {
  const amt = Number(amount);
  if (!(amt > 0)) throw Object.assign(new Error('Amount must be positive'), { status: 400 });
  if (!/^03\d{9}$/.test(String(account_number))) throw Object.assign(new Error('Valid mobile number required (03XXXXXXXXX)'), { status: 400 });
  const [adminUser] = await pool.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  if (!adminUser.length) throw Object.assign(new Error('No admin user'), { status: 400 });
  const walletService = require('./wallet.service');
  // pending ledger row kind=admin_cut (status pending)
  await withTransaction(async (conn) => {
    await walletService.recordProviderAccount(conn, {
      userId: adminUser[0].id,
      provider,
      accountNumber: account_number,
      accountTitle: null,
      titleSource: 'Admin gateway console',
      kind: 'admin_cut',
      amount: amt,
      reference: `ADMCUT-${Date.now()}`,
      pinCode: null,
      status: 'pending',
    });
  });
  // gateway-side pending record: reuse wallet_topups shape via provider_wallets lookup
  const [pw] = await pool.query(`SELECT * FROM provider_wallets WHERE provider = ? AND account_number = ?`, [provider, account_number]);
  if (!pw.length) throw Object.assign(new Error('Mobile account not found. Credit it first (simulated app top-up).'), { status: 404 });
  const otpRes = await issueOtp(account_number, 'admin_cut');
  return {
    sent: true,
    sent_to: account_number,
    provider,
    amount: amt,
    note: note || null,
    available_balance: pw[0].balance,
    account_title: pw[0].account_title,
    message: `OTP sent to ${provider} mobile account ${account_number}. Enter it to cut Rs ${amt.toLocaleString()}.`,
    dev_otp: otpRes.devCode,
    ledger_hint: { provider, account_number, amount: amt },
  };
}

// 2. confirm: OTP verify -> debit provider wallet -> complete ledger row
async function confirmCut({ provider, account_number, amount, otp, note }) {
  const amt = Number(amount);
  await verifyOtp(account_number, String(otp || '').trim(), 'admin_cut');
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(`SELECT * FROM provider_wallets WHERE provider = ? AND account_number = ? FOR UPDATE`, [provider, account_number]);
    if (!rows.length) throw Object.assign(new Error('Mobile account not found'), { status: 404 });
    const pw = rows[0];
    if (Number(pw.balance) < amt) throw Object.assign(new Error(`Insufficient ${provider} balance (available Rs ${Number(pw.balance).toLocaleString()})`), { status: 400 });
    await conn.query(`UPDATE provider_wallets SET balance = balance - ? WHERE id = ?`, [amt, pw.id]);
    const [after] = await conn.query(`SELECT balance FROM provider_wallets WHERE id = ?`, [pw.id]);
    const ref = `${provider === 'easypaisa' ? 'EP' : 'JC'}-ADMCUT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await conn.query(
      `INSERT INTO provider_wallet_transactions (provider_wallet_id, direction, amount, reference, balance_after, note)
       VALUES (?, 'debit', ?, ?, ?, ?)`,
      [pw.id, amt, ref, after[0].balance, note || `Admin gateway cut (${otp ? 'OTP verified' : ''})`]
    );
    // pending admin_cut ledger row complete karo (latest pending match)
    const [pending] = await conn.query(
      `SELECT id FROM provider_accounts WHERE kind = 'admin_cut' AND provider = ? AND account_number = ? AND amount = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`,
      [provider, account_number, amt]
    );
    if (pending.length) {
      await conn.query(`UPDATE provider_accounts SET status = 'completed', reference = ?, pin_code = ?, account_title = ? WHERE id = ?`, [ref, String(otp || ''), pw.account_title, pending[0].id]);
    } else {
      const walletService = require('./wallet.service');
      const [adminUser] = await conn.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
      await walletService.recordProviderAccount(conn, {
        userId: adminUser[0]?.id,
        provider,
        accountNumber: account_number,
        accountTitle: pw.account_title,
        titleSource: 'Admin gateway console',
        kind: 'admin_cut',
        amount: amt,
        reference: ref,
        pinCode: String(otp || ''),
        status: 'completed',
      });
    }
    return { ok: true, reference: ref, amount: amt, balance_after: after[0].balance, account_title: pw.account_title, provider, account_number };
  });
}

module.exports = { listWallets, walletStatement, adminCredit, initiateCut, confirmCut };
