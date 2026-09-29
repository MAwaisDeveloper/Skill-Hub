const { pool, withTransaction } = require('../config/db');
const { HttpError } = require('../middleware/error');
const { getSettings, notify: notifyHelper } = require('../utils/helpers');

// ---------- Provider account records (ADMIN-ONLY visibility) ----------
// Har JazzCash/Easypaisa movement (top-up ya withdrawal) par user ka provider
// account snapshot store hota hai: number, provider, account title (kis ke naam
// par hai), amount aur reference. Ye data sirf admin panel mein dikhta hai:
// customer/professional apne statement mein sirf apna ledger dekhte hain.
async function recordProviderAccount(conn, { userId, provider, accountNumber, accountTitle = null, titleSource = null, kind, amount, reference = null, pinCode = null, status = 'pending' }) {
  const [u] = await conn.query(`SELECT role FROM users WHERE id = ?`, [userId]);
  await conn.query(
    `INSERT INTO provider_accounts (user_id, role, provider, account_number, account_title, title_source, kind, amount, reference, pin_code, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, u[0]?.role || 'customer', provider, accountNumber, accountTitle, titleSource, kind, amount, reference, pinCode, status]
  );
}

// ---------- Core ledger helpers ----------

// Platform revenue: admin user ke wallet mein commission credit (real money flow)
// Har booking release + contract milestone release dono se call hota hai.
async function creditPlatformRevenue(conn, amount, note) {
  if (!(amount > 0)) return null;
  const [admins] = await conn.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  if (!admins.length) return null;
  const wallet = await getWalletForUpdate(conn, admins[0].id);
  await conn.query(`UPDATE wallets SET balance = balance + ? WHERE id = ?`, [amount, wallet.id]);
  const [after] = await conn.query(`SELECT balance FROM wallets WHERE id = ?`, [wallet.id]);
  await addLedger(conn, wallet.id, 'commission', amount, null, note, after[0].balance);
  return after[0].balance;
}

async function getWalletForUpdate(conn, userId) {
  const [rows] = await conn.query(`SELECT * FROM wallets WHERE user_id = ? FOR UPDATE`, [userId]);
  if (rows.length) return rows[0];
  const [res] = await conn.query(`INSERT INTO wallets (user_id, balance, held_amount) VALUES (?, 0, 0)`, [userId]);
  const [created] = await conn.query(`SELECT * FROM wallets WHERE id = ? FOR UPDATE`, [res.insertId]);
  return created[0];
}

async function addLedger(conn, walletId, type, amount, bookingId, note, balanceAfter) {
  await conn.query(
    `INSERT INTO wallet_transactions (wallet_id, type, amount, related_booking_id, note, balance_after)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [walletId, type, amount, bookingId, note, balanceAfter]
  );
}

// ---------- Wallet queries ----------

async function getWallet(userId) {
  await pool.query(`INSERT IGNORE INTO wallets (user_id) VALUES (?)`, [userId]);
  const [rows] = await pool.query(`SELECT * FROM wallets WHERE user_id = ?`, [userId]);
  return rows[0];
}

async function getTransactions(userId) {
  const [wallet] = await pool.query(`SELECT id FROM wallets WHERE user_id = ?`, [userId]);
  if (!wallet.length) return [];
  // Enrich each ledger row with counterparty name + booking code + role labels:
  // - 'hold'/'refund' rows belong to the customer; counterparty = professional of that booking
  // - 'payout' rows belong to the professional; counterparty = customer of that booking
  const [rows] = await pool.query(
    `SELECT t.*,
            b.booking_code,
            c.name AS category_name,
            CASE
              WHEN t.type IN ('hold','refund') THEN COALESCE(sp.full_name, cu.full_name)
              WHEN t.type = 'payout' THEN cu.full_name
              ELSE NULL
            END AS counterparty_name,
            CASE
              WHEN t.type IN ('hold','refund') THEN 'Service Professional'
              WHEN t.type = 'payout' THEN 'Customer'
              WHEN t.type = 'topup' THEN 'JazzCash/Easypaisa Top-up'
              WHEN t.type = 'compensation' THEN 'Customer cancellation compensation'
              WHEN t.type = 'withdrawal' THEN 'JazzCash/Easypaisa Withdrawal'
              WHEN t.type = 'commission' THEN 'Platform'
              WHEN t.type = 'penalty' THEN 'Platform (Penalty)'
              ELSE 'Platform'
            END AS counterparty_role
     FROM wallet_transactions t
     LEFT JOIN bookings b ON b.id = t.related_booking_id
     LEFT JOIN categories c ON c.id = b.category_id
     LEFT JOIN service_professionals sp ON sp.id = b.professional_id
     LEFT JOIN customers cu ON cu.id = b.customer_id
     WHERE t.wallet_id = ?
     ORDER BY t.id DESC
     LIMIT 200`,
    [wallet[0].id]
  );
  return rows;
}

// ---------- Top-up (Section 8.1) ----------
// Flow: platform creates a pending topup, then redirects customer to the
// gateway's OWN secure page (JazzCash/Easypaisa). The PIN is entered there,
// never on our site. Gateway calls our callback (here: simulated/confirmed).

async function createTopup(userId, provider, mobileNumber, amount) {
  if (!['jazzcash', 'easypaisa'].includes(provider)) throw new HttpError(400, 'Provider must be jazzcash or easypaisa');
  if (!(amount >= 100)) throw new HttpError(400, 'Minimum top-up is Rs. 100');

  const wallet = await getWallet(userId);
  const [res] = await pool.query(
    `INSERT INTO wallet_topups (wallet_id, user_id, provider, mobile_number, amount, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [wallet.id, userId, provider, mobileNumber, amount]
  );
  const topupId = res.insertId;
  const ref = 'TU' + String(topupId).padStart(8, '0');
  await pool.query(`UPDATE wallet_topups SET gateway_transaction_ref = ? WHERE id = ?`, [ref, topupId]);

  // TODO production: call gateway redirect API with ref + amount, return its URL.
  return {
    topup_id: topupId,
    reference: ref,
    provider,
    amount,
    redirect_url: `/wallet/topup/${ref}/pay`, // gateway's secure checkout page (simulated in dev)
  };
}

// Gateway callback / simulated success: credit the wallet inside a transaction.
async function completeTopup({ reference, success = true }) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(`SELECT * FROM wallet_topups WHERE gateway_transaction_ref = ? FOR UPDATE`, [reference]);
    if (!rows.length) throw new HttpError(404, 'Top-up reference not found');
    const topup = rows[0];
    if (topup.status !== 'pending') throw new HttpError(400, `Top-up already ${topup.status}`);

    if (!success) {
      await conn.query(`UPDATE wallet_topups SET status = 'failed' WHERE id = ?`, [topup.id]);
      return { status: 'failed' };
    }

    const wallet = await getWalletForUpdate(conn, topup.user_id);
    await conn.query(`UPDATE wallets SET balance = balance + ? WHERE id = ?`, [topup.amount, wallet.id]);
    const [after] = await conn.query(`SELECT balance FROM wallets WHERE id = ?`, [wallet.id]);
    await addLedger(conn, wallet.id, 'topup', topup.amount, null, `Top-up via ${topup.provider} (${reference})`, after[0].balance);
    await conn.query(`UPDATE wallet_topups SET status = 'success', completed_at = NOW() WHERE id = ?`, [topup.id]);
    await conn.query(
      `INSERT INTO payments (user_id, amount, payment_method, transaction_ref, status) VALUES (?, ?, ?, ?, 'success')`,
      [topup.user_id, topup.amount, topup.provider, reference]
    );
    // Provider account record (admin-only visibility): jis number se paisa aaya,
    // kis ke naam par hai (real mobile-account title), OTP jo user ne dala
    const [pw] = await conn.query(`SELECT account_title, balance FROM provider_wallets WHERE provider = ? AND account_number = ?`, [topup.provider, topup.mobile_number]);
    const { lookupAccountTitle } = require('./lookup.service');
    const lookup = pw[0]?.account_title
      ? { found: true, account_title: pw[0].account_title, source: 'Mobile account (real holder)' }
      : await lookupAccountTitle(topup.provider, topup.mobile_number);
    await recordProviderAccount(conn, {
      userId: topup.user_id,
      provider: topup.provider,
      accountNumber: topup.mobile_number,
      accountTitle: lookup.found ? lookup.account_title : null,
      titleSource: lookup.source || null,
      kind: 'topup',
      amount: topup.amount,
      reference,
      pinCode: topup.pin_code || null,
      status: 'success',
    });
    // NOTE: provider mobile account se paisa OTP-verify par hi cut ho chuka hai
    // (gateway.service gatewayVerifyOtp debit) — callback par wapas credit NAHI
    // hota. Sirf real account-title ensure karta hoon (admin ledger ke liye).
    await conn.query(
      `UPDATE provider_wallets SET account_title = COALESCE(account_title, ?) WHERE provider = ? AND account_number = ?`,
      [lookup.found ? lookup.account_title : null, topup.provider, topup.mobile_number]
    );
    await notifyHelper(topup.user_id, 'wallet', `Wallet top-up successful: Rs ${topup.amount} via ${topup.provider}`);
    return { status: 'success', balance: after[0].balance, amount: topup.amount };
  });
}

// ---------- Booking escrow (Section 8.2) ----------

async function holdForBooking(conn, userId, bookingId, amount) {
  const wallet = await getWalletForUpdate(conn, userId);
  if (Number(wallet.balance) < amount) {
    throw new HttpError(400, `Insufficient wallet balance. Available Rs. ${wallet.balance}, required Rs. ${amount}. Please top-up first.`);
  }
  await conn.query(`UPDATE wallets SET balance = balance - ?, held_amount = held_amount + ? WHERE id = ?`, [
    amount,
    amount,
    wallet.id,
  ]);
  const [after] = await conn.query(`SELECT balance FROM wallets WHERE id = ?`, [wallet.id]);
  await addLedger(conn, wallet.id, 'hold', amount, bookingId, 'Escrow hold for booking', after[0].balance);
}

async function refundHold(conn, userId, bookingId, amount, note) {
  const wallet = await getWalletForUpdate(conn, userId);
  await conn.query(`UPDATE wallets SET balance = balance + ?, held_amount = GREATEST(0, held_amount - ?) WHERE id = ?`, [
    amount,
    amount,
    wallet.id,
  ]);
  const [after] = await conn.query(`SELECT balance FROM wallets WHERE id = ?`, [wallet.id]);
  await addLedger(conn, wallet.id, 'refund', amount, bookingId, note, after[0].balance);
}

// Section 8.3: release held money: commission cut, 90% to professional.
async function releaseForBooking(conn, bookingId, trigger = 'customer_confirm') {
  const settings = await getSettings();
  const [bookings] = await conn.query(`SELECT * FROM bookings WHERE id = ? FOR UPDATE`, [bookingId]);
  const booking = bookings[0];
  if (!booking) throw new HttpError(404, 'Booking not found');
  if (booking.status === 'completed' || booking.status === 'refunded') {
    throw new HttpError(400, 'Booking already settled');
  }

  const amount = Number(booking.final_price);
  const commissionPercent = settings.commissionPercent;
  const commissionAmount = Math.round(amount * (commissionPercent / 100) * 100) / 100;
  const proAmount = amount - commissionAmount;

  // 1) Commission record + platform revenue wallet credit (real money flow)
  await conn.query(`INSERT INTO commissions (booking_id, amount, percentage) VALUES (?, ?, ?)`, [
    bookingId,
    commissionAmount,
    commissionPercent,
  ]);
  await creditPlatformRevenue(conn, commissionAmount, `Booking #${bookingId} commission (${commissionPercent}%)`);

  // 2) Release from customer hold -> platform ledger effect: money leaves customer wallet
  const [custRows] = await conn.query(
    `SELECT u.id AS user_id FROM bookings b JOIN customers c ON c.id = b.customer_id JOIN users u ON u.id = c.user_id WHERE b.id = ?`,
    [bookingId]
  );
  const customerUserId = custRows[0].user_id;
  const custWallet = await getWalletForUpdate(conn, customerUserId);
  await conn.query(`UPDATE wallets SET held_amount = GREATEST(0, held_amount - ?) WHERE id = ?`, [amount, custWallet.id]);
  // ledger note carries professional name so "kis ke naam se gaya" is visible
  const [proNameRows] = await conn.query(`SELECT full_name FROM service_professionals WHERE id = ?`, [booking.professional_id]);
  const proName = proNameRows.length ? proNameRows[0].full_name : 'professional';
  await addLedger(conn, custWallet.id, 'release', amount, bookingId, `Payment released to ${proName} (service charges ${commissionPercent}% deducted)`, custWallet.balance);

  // 3) Professional payout (wallet credit after penalty deduction)
  const [proRows] = await conn.query(
    `SELECT u.id AS user_id FROM service_professionals sp JOIN users u ON u.id = sp.user_id WHERE sp.id = ?`,
    [booking.professional_id]
  );
  const proUserId = proRows[0].user_id;

  // 4) Auto-deduct unsettled penalties first (Section 10.1 negative-balance mechanism)
  let netPro = proAmount;
  const [penalties] = await conn.query(
    `SELECT * FROM professional_penalties WHERE professional_id = ? AND settled = 0 ORDER BY id ASC FOR UPDATE`,
    [booking.professional_id]
  );
  let remaining = proAmount;
  for (const pen of penalties) {
    const due = Number(pen.amount);
    if (remaining <= 0) break;
    const take = Math.min(due, remaining);
    await conn.query(`UPDATE professional_penalties SET amount = amount - ?, settled = ?, settled_at = ? WHERE id = ?`, [
      take,
      take >= due ? 1 : 0,
      take >= due ? new Date() : null,
      pen.id,
    ]);
    remaining -= take;
    netPro -= take;
    await conn.query(
      `INSERT INTO wallet_transactions (wallet_id, type, amount, related_booking_id, note, balance_after)
       SELECT id, 'penalty', ?, ?, ?, balance FROM wallets WHERE user_id = ?`,
      [take, bookingId, `Penalty recovered from payout (${pen.reason || 'cancellation penalty'})`, proUserId]
    );
  }

  const proWallet = await getWalletForUpdate(conn, proUserId);
  await conn.query(`UPDATE wallets SET balance = balance + ? WHERE id = ?`, [netPro, proWallet.id]);
  const [proAfter] = await conn.query(`SELECT balance FROM wallets WHERE id = ?`, [proWallet.id]);

  await addLedger(conn, proWallet.id, 'payout', netPro, bookingId, `Job payout (Rs ${amount} - ${commissionPercent}% service charges - penalties)`, proAfter[0].balance);

  await conn.query(`INSERT INTO payouts (professional_id, booking_id, amount, status, released_at) VALUES (?, ?, ?, 'released', NOW())`, [
    booking.professional_id,
    bookingId,
    netPro,
  ]);

  await conn.query(`UPDATE bookings SET status = 'completed', completed_at = NOW() WHERE id = ?`, [bookingId]);
  await conn.query(
    `INSERT INTO booking_events (booking_id, event_type, note) VALUES (?, 'payment_released', ?)`,
    [bookingId, `Released Rs ${netPro} to professional; service charges Rs ${commissionAmount} (${trigger})`]
  );

  await notifyHelper(proUserId, 'payout', `Payment Rs ${netPro} released for booking ${booking.booking_code}`, bookingId, null, conn);
  await notifyHelper(customerUserId, 'payout', `Payment Rs ${amount} released for booking ${booking.booking_code}`, bookingId, null, conn);

  return { commission: commissionAmount, payout: netPro, total: amount };
}

// ---------- Statement (JazzCash-style: incoming / outgoing / pending + filters + pagination) ----------

// Direction per transaction type, from the wallet owner's perspective:
//  in  = paisa AYA   (topup, refund, payout credit, cancellation compensation)
//  out = paisa GAYA  (hold, release, penalty, commission-cut, withdrawal)
const IN_TYPES = ['topup', 'refund', 'payout', 'compensation'];
const OUT_TYPES = ['hold', 'release', 'penalty', 'commission', 'withdrawal'];

async function getStatement(userId, opts = {}) {
  const page = Math.max(1, Number(opts.page) || 1);
  const perPage = Math.min(100, Math.max(5, Number(opts.per_page) || 15));
  const { type, direction, from, to } = opts;

  const [wallets] = await pool.query(`SELECT * FROM wallets WHERE user_id = ?`, [userId]);
  if (!wallets.length) {
    return { summary: { balance: 0, held: 0, total_in: 0, total_out: 0, pending_withdrawals: 0, pending_withdrawals_amount: 0, pending_penalty: 0 }, rows: [], pagination: { page, per_page: perPage, total: 0, total_pages: 0 } };
  }
  const wallet = wallets[0];

  const where = ['t.wallet_id = ?'];
  const params = [wallet.id];
  if (type) { where.push('t.type = ?'); params.push(type); }
  if (direction === 'in') where.push(`t.type IN ('topup','refund','payout','compensation')`);
  if (direction === 'out') where.push(`t.type IN ('hold','release','penalty','commission','withdrawal')`);
  if (from) { where.push('DATE(t.created_at) >= ?'); params.push(from); }
  if (to) { where.push('DATE(t.created_at) <= ?'); params.push(to); }

  const baseSql = `
    FROM wallet_transactions t
    LEFT JOIN bookings b ON b.id = t.related_booking_id
    LEFT JOIN categories c ON c.id = b.category_id
    LEFT JOIN service_professionals sp ON sp.id = b.professional_id
    LEFT JOIN customers cu ON cu.id = b.customer_id
    WHERE ${where.join(' AND ')}`;

  const [countRows] = await pool.query(`SELECT COUNT(*) AS total ${baseSql}`, params);
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT t.*,
            b.booking_code, b.id AS booking_id, c.name AS category_name,
            (SELECT wt.gateway_transaction_ref FROM wallet_topups wt
              WHERE wt.user_id = ? AND wt.status IN ('success', 'completed')
                AND t.note LIKE CONCAT('%', wt.gateway_transaction_ref, '%')
              LIMIT 1) AS topup_ref,
            (SELECT pp.id FROM professional_penalties pp
              JOIN service_professionals sp2 ON sp2.id = pp.professional_id
              WHERE sp2.user_id = ? AND pp.booking_id = t.related_booking_id
              LIMIT 1) AS penalty_id,
            (SELECT w.id FROM withdrawals w
              WHERE w.user_id = ? AND t.type = 'withdrawal' AND w.amount = t.amount
                AND t.note LIKE CONCAT('%', w.account_number, '%')
              ORDER BY w.id DESC LIMIT 1) AS withdrawal_id,
            CASE
              WHEN t.type IN ('hold','refund','release') THEN COALESCE(sp.full_name, cu.full_name)
              WHEN t.type = 'payout' THEN cu.full_name
              ELSE NULL
            END AS counterparty_name,
            CASE
              WHEN t.type IN ('hold','refund','release') THEN 'Service Professional'
              WHEN t.type = 'payout' THEN 'Customer'
              WHEN t.type = 'topup' THEN 'JazzCash/Easypaisa Top-up'
              WHEN t.type = 'compensation' THEN 'Customer cancellation compensation'
              WHEN t.type = 'withdrawal' THEN 'JazzCash/Easypaisa Withdrawal'
              WHEN t.type = 'commission' THEN 'Platform'
              WHEN t.type = 'penalty' THEN 'Platform (Penalty)'
              ELSE 'Platform'
            END AS counterparty_role
     ${baseSql}
     ORDER BY t.id DESC
     LIMIT ? OFFSET ?`,
    [userId, userId, userId, ...params, perPage, (page - 1) * perPage]
  );

  const [sumRows] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN t.type IN ('topup','refund','payout') THEN t.amount END), 0) AS total_in,
       COALESCE(SUM(CASE WHEN t.type IN ('hold','release','penalty','commission') THEN t.amount END), 0) AS total_out
     FROM wallet_transactions t WHERE t.wallet_id = ?`,
    [wallet.id]
  );
  const [wdRows] = await pool.query(
    `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS amt FROM withdrawals WHERE user_id = ? AND status = 'pending'`,
    [userId]
  );
  const [penRows] = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS amt FROM professional_penalties pp
     JOIN service_professionals sp ON sp.id = pp.professional_id WHERE sp.user_id = ? AND pp.settled = 0`,
    [userId]
  );

  return {
    summary: {
      balance: Number(wallet.balance),
      held: Number(wallet.held_amount),
      total_in: Number(sumRows[0].total_in),
      total_out: Number(sumRows[0].total_out),
      pending_withdrawals: wdRows[0].cnt,
      pending_withdrawals_amount: Number(wdRows[0].amt),
      pending_penalty: Number(penRows[0].amt),
    },
    rows,
    pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
  };
}

module.exports = {
  creditPlatformRevenue,
  getWallet,
  getTransactions,
  getStatement,
  createTopup,
  completeTopup,
  holdForBooking,
  refundHold,
  releaseForBooking,
  getWalletForUpdate,
  addLedger,
  recordProviderAccount,
};
