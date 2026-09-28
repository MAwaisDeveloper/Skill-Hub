const { pool, withTransaction } = require('../config/db');
const { HttpError } = require('../middleware/error');
const { lookupAccountTitle } = require('./lookup.service');
const walletService = require('./wallet.service');
const gatewayService = require('./gateway.service');
const { notify } = require('../utils/helpers');

// Request a withdrawal: money leaves wallet immediately (held until admin
// transfers or rejects). Works for both customer and professional.
async function requestWithdrawal(userId, role, { amount, provider, account_number }) {
  if (!(amount >= 500)) throw new HttpError(400, 'Minimum withdrawal Rs 500');
  if (!['jazzcash', 'easypaisa'].includes(provider)) throw new HttpError(400, 'Provider select karein');
  const title = await lookupAccountTitle(provider, account_number);
  if (!title.found) throw new HttpError(400, `Account title Not Found for ${account_number} on ${provider}. Number check karein.`);

  return withTransaction(async (conn) => {
    const [wallets] = await conn.query(`SELECT * FROM wallets WHERE user_id = ? FOR UPDATE`, [userId]);
    if (!wallets.length) throw new HttpError(400, 'Wallet missing');
    const wallet = wallets[0];
    if (Number(wallet.balance) < amount) throw new HttpError(400, `Insufficient balance (available Rs ${wallet.balance})`);

    await conn.query(`UPDATE wallets SET balance = balance - ? WHERE id = ?`, [amount, wallet.id]);
    const [after] = await conn.query(`SELECT balance FROM wallets WHERE id = ?`, [wallet.id]);
    // 'withdrawal' type (OUT) — pehle 'payout' likha jata tha jo IN direction hai;
    // admin transactions mein withdrawal "Incoming" dikhti thi (audit jhooth)
    await walletService.addLedger(conn, wallet.id, 'withdrawal', amount, null, `Withdrawal request → ${provider} ${account_number} (${title.account_title}) — pending admin transfer`, after[0].balance);

    const [res] = await conn.query(
      `INSERT INTO withdrawals (user_id, role, provider, account_number, account_title, amount, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [userId, role, provider, account_number, title.account_title, amount]
    );
    const withdrawalId = res.insertId;
    return { withdrawal_id: withdrawalId, amount, to: `${title.account_title} (${account_number})`, status: 'pending' };
  });
}

// Auto-payout: the gateway disburses immediately after the request — no manual
// admin approval needed (admins are not sitting on the site all day). The
// adapter returns a real transaction id; failure path keeps money in the wallet.
async function autoDisburse(withdrawalId) {
  const [rows] = await pool.query(`SELECT * FROM withdrawals WHERE id = ?`, [withdrawalId]);
  const wd = rows[0];
  if (!wd || wd.status !== 'pending') return null;
  let gw;
  try {
    gw = await gatewayService.disburse({
      provider: wd.provider,
      account_number: wd.account_number,
      amount: Number(wd.amount),
      reference: `WD${String(wd.id).padStart(8, '0')}`,
    });
  } catch (e) {
    // Gateway unreachable: keep pending so the admin queue stays the safety net
    await notify(wd.user_id, 'payout', `Withdrawal Rs ${wd.amount} is processing — we will notify you as soon as the transfer completes.`);
    return { status: 'pending', reason: 'gateway_unavailable' };
  }
  if (!gw.success) {
    return adminResolve(wd.id, 'reject', `Gateway declined the transfer (${gw.message || 'unknown reason'}); amount returned to wallet`);
  }
  const note = `Auto-paid via gateway · TID ${gw.gateway_transaction_id}`;
  return withTransaction(async (conn) => {
    const [again] = await conn.query(`SELECT * FROM withdrawals WHERE id = ? FOR UPDATE`, [wd.id]);
    if (again[0].status !== 'pending') return { status: again[0].status };
    await conn.query(`UPDATE withdrawals SET status = 'completed', processed_at = NOW(), admin_note = ? WHERE id = ?`, [note, wd.id]);
    await notify(wd.user_id, 'payout', `Withdrawal Rs ${wd.amount} completed → ${wd.account_title} (${wd.provider} ${wd.account_number}) · TID ${gw.gateway_transaction_id}`);
    return { status: 'completed', tid: gw.gateway_transaction_id };
  });
}

async function listMine(userId) {
  const [rows] = await pool.query(`SELECT * FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 100`, [userId]);
  return rows;
}

async function adminList() {
  const [rows] = await pool.query(
    `SELECT w.*, u.phone, u.role FROM withdrawals w JOIN users u ON u.id = w.user_id ORDER BY w.id DESC LIMIT 200`
  );
  return rows;
}

async function adminResolve(id, action, adminNote) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(`SELECT * FROM withdrawals WHERE id = ? FOR UPDATE`, [id]);
    const wd = rows[0];
    if (!wd) throw new HttpError(404, 'Withdrawal not found');
    if (wd.status !== 'pending') throw new HttpError(400, 'Already processed');
    if (action === 'complete') {
      await conn.query(`UPDATE withdrawals SET status = 'completed', processed_at = NOW(), admin_note = ? WHERE id = ?`, [adminNote || null, id]);
      await notify(wd.user_id, 'payout', `Withdrawal Rs ${wd.amount} completed → ${wd.account_title} (${wd.provider} ${wd.account_number})`);
      return { status: 'completed' };
    }
    // reject → refund money back
    const [wallets] = await conn.query(`SELECT * FROM wallets WHERE user_id = ? FOR UPDATE`, [wd.user_id]);
    await conn.query(`UPDATE wallets SET balance = balance + ? WHERE id = ?`, [wd.amount, wallets[0].id]);
    const [after] = await conn.query(`SELECT balance FROM wallets WHERE id = ?`, [wallets[0].id]);
    await walletService.addLedger(conn, wallets[0].id, 'refund', wd.amount, null, `Withdrawal rejected by admin — refund${adminNote ? `: ${adminNote}` : ''}`, after[0].balance);
    await conn.query(`UPDATE withdrawals SET status = 'rejected', processed_at = NOW(), admin_note = ? WHERE id = ?`, [adminNote || null, id]);
    await notify(wd.user_id, 'payout', `Withdrawal Rs ${wd.amount} rejected — Rs ${wd.amount} wapas wallet mein${adminNote ? ` (${adminNote})` : ''}`);
    return { status: 'rejected' };
  });
}

module.exports = { requestWithdrawal, listMine, adminList, adminResolve, autoDisburse };
