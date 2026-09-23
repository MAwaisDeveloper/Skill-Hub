const router = require('express').Router();
const { pool } = require('../config/db');
const { asyncHandler, HttpError } = require('../middleware/error');
const { authenticate, requireRole } = require('../middleware/auth');
const verificationService = require('../services/verification.service');

const adminOnly = [authenticate, requireRole('admin')];

// ---- Dashboard stats ----
router.get('/dashboard', ...adminOnly, asyncHandler(async (req, res) => {
  const [stats] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM service_professionals WHERE verification_status = 'pending') AS pending_verifications,
       (SELECT COUNT(*) FROM bookings WHERE status IN ('waiting_for_professional','accepted','on_the_way','arrived','work_started','work_completed')) AS active_bookings,
       (SELECT COUNT(*) FROM disputes WHERE status = 'open') AS open_disputes,
       (SELECT COALESCE(SUM(amount),0) FROM commissions) AS total_commission,
       (SELECT COUNT(*) FROM users WHERE role = 'customer') AS total_customers,
       (SELECT COUNT(*) FROM users WHERE role = 'professional') AS total_professionals`
  );
  res.json(stats[0]);
}));

// ---- Verification queue & decisions (Section 4) ----
router.get('/verifications', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await verificationService.getVerificationQueue());
}));

router.post('/verifications/:professionalId/review', ...adminOnly, asyncHandler(async (req, res) => {
  const { decision, notes } = req.body;
  res.json(await verificationService.reviewVerification({
    professionalId: Number(req.params.professionalId),
    adminUserId: req.user.id,
    decision,
    notes,
  }));
}));

router.get('/verifications/:professionalId/logs', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await verificationService.getVerificationLogs(Number(req.params.professionalId)));
}));

// ---- Disputes resolution ----
router.get('/disputes', ...adminOnly, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT d.*, b.booking_code, b.final_price, b.status AS booking_status
     FROM disputes d JOIN bookings b ON b.id = d.booking_id ORDER BY d.created_at DESC`
  );
  res.json(rows);
}));

router.post('/disputes/:id/resolve', ...adminOnly, asyncHandler(async (req, res) => {
  const { resolution, outcome, admin_note } = req.body;
  if (!['customer', 'professional', 'split'].includes(outcome)) {
    throw new HttpError(400, 'outcome must be customer | professional | split');
  }
  const { withTransaction } = require('../config/db');
  const walletService = require('../services/wallet.service');
  const { notify } = require('../utils/helpers');

  await withTransaction(async (conn) => {
    const [disputes] = await conn.query(`SELECT * FROM disputes WHERE id = ? FOR UPDATE`, [Number(req.params.id)]);
    const dispute = disputes[0];
    if (!dispute) throw new HttpError(404, 'Dispute not found');
    if (dispute.status !== 'open') throw new HttpError(400, 'Dispute already resolved');

    const [bookings] = await conn.query(`SELECT * FROM bookings WHERE id = ? FOR UPDATE`, [dispute.booking_id]);
    const booking = bookings[0];
    const [cust] = await conn.query(`SELECT u.id AS uid FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = ?`, [booking.customer_id]);
    const [pro] = await conn.query(`SELECT u.id AS uid FROM service_professionals sp JOIN users u ON u.id = sp.user_id WHERE sp.id = ?`, [booking.professional_id]);
    const customerUserId = cust[0].uid;
    const proUserId = pro[0].uid;
    const amount = Number(booking.final_price);
    const { getSettings } = require('../utils/helpers');
    const settings = await getSettings();
    const commissionPercent = settings.commissionPercent;

    if (outcome === 'customer') {
      await walletService.refundHold(conn, customerUserId, booking.id, amount, 'Dispute resolved in customer favor');
      await conn.query(`INSERT INTO refunds (booking_id, amount, reason, status, processed_at) VALUES (?, ?, 'Dispute resolved - customer', 'processed', NOW())`, [booking.id, amount]);
      await conn.query(`UPDATE bookings SET status = 'refunded' WHERE id = ?`, [booking.id]);
    } else if (outcome === 'professional') {
      await walletService.releaseForBooking(conn, booking.id, 'dispute_resolved_pro');
    } else {
      // split: commission on full, half back to customer, half (minus commission) to pro
      const commission = Math.round(amount * (commissionPercent / 100) * 100) / 100;
      const half = Math.round((amount - commission) / 2 * 100) / 100;
      await conn.query(`INSERT INTO commissions (booking_id, amount, percentage) VALUES (?, ?, ?)`, [booking.id, commission, commissionPercent]);
      const custWallet = await walletService.getWalletForUpdate(conn, customerUserId);
      await conn.query(`UPDATE wallets SET held_amount = GREATEST(0, held_amount - ?), balance = balance + ? WHERE id = ?`, [amount / 2, half, custWallet.id]);
      const [cw] = await conn.query(`SELECT balance FROM wallets WHERE id = ?`, [custWallet.id]);
      await walletService.addLedger(conn, custWallet.id, 'refund', half, booking.id, 'Dispute split - customer share', cw[0].balance);
      const proWallet = await walletService.getWalletForUpdate(conn, proUserId);
      await conn.query(`UPDATE wallets SET held_amount = GREATEST(0, held_amount - ?), balance = balance + ? WHERE id = ?`, [amount / 2, half, proWallet.id]);
      const [pw] = await conn.query(`SELECT balance FROM wallets WHERE id = ?`, [proWallet.id]);
      await walletService.addLedger(conn, proWallet.id, 'payout', half, booking.id, 'Dispute split - professional share', pw[0].balance);
      await conn.query(`UPDATE bookings SET status = 'completed' WHERE id = ?`, [booking.id]);
    }

    await conn.query(`UPDATE disputes SET status = ?, resolution = ?, resolved_by = ? WHERE id = ?`, [
      outcome === 'customer' ? 'resolved_customer' : outcome === 'professional' ? 'resolved_professional' : 'closed',
      `${outcome}: ${resolution || admin_note || ''}`,
      req.user.id,
      dispute.id,
    ]);
    await notify(customerUserId, 'dispute', `Dispute on booking ${booking.booking_code} resolved (${outcome})`, booking.id);
    await notify(proUserId, 'dispute', `Dispute on booking ${booking.booking_code} resolved (${outcome})`, booking.id);
  });
  res.json({ resolved: true });
}));

// ---- Users management ----
router.get('/users', ...adminOnly, asyncHandler(async (req, res) => {
  const where = ['1=1'];
  const params = [];
  if (req.query.role) { where.push('u.role = ?'); params.push(req.query.role); }
  if (req.query.q) { where.push('(u.phone LIKE ? OR COALESCE(c.full_name, sp.full_name) LIKE ? OR u.email LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`); }
  const [rows] = await pool.query(
    `SELECT u.id, u.phone, u.email, u.role, u.status, u.created_at,
       CASE u.role WHEN 'customer' THEN (SELECT full_name FROM customers c WHERE c.user_id = u.id)
                   WHEN 'professional' THEN (SELECT full_name FROM service_professionals sp WHERE sp.user_id = u.id) END AS full_name,
       CASE u.role WHEN 'customer' THEN (SELECT trust_score FROM customers c WHERE c.user_id = u.id)
                   WHEN 'professional' THEN (SELECT trust_score FROM service_professionals sp WHERE sp.user_id = u.id) END AS trust_score,
       CASE u.role WHEN 'professional' THEN (SELECT verification_status FROM service_professionals sp2 WHERE sp2.user_id = u.id) END AS verification_status
     FROM users u
     LEFT JOIN customers c ON c.user_id = u.id
     LEFT JOIN service_professionals sp ON sp.user_id = u.id
     WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC LIMIT 500`,
    params
  );
  res.json(rows);
}));

router.post('/users/:id/suspend', ...adminOnly, asyncHandler(async (req, res) => {
  await pool.query(`UPDATE users SET status = 'suspended' WHERE id = ?`, [Number(req.params.id)]);
  res.json({ suspended: true });
}));

router.post('/users/:id/activate', ...adminOnly, asyncHandler(async (req, res) => {
  await pool.query(`UPDATE users SET status = 'active' WHERE id = ?`, [Number(req.params.id)]);
  res.json({ activated: true });
}));

// ---- Payout requests (withdraw approvals) ----
router.get('/payouts', ...adminOnly, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT p.*, sp.full_name, sp.payout_account, sp.payout_provider
     FROM payouts p JOIN service_professionals sp ON sp.id = p.professional_id
     ORDER BY p.created_at DESC LIMIT 200`
  );
  res.json(rows);
}));

router.post('/payouts/:id/release', ...adminOnly, asyncHandler(async (req, res) => {
  const { withTransaction } = require('../config/db');
  await withTransaction(async (conn) => {
    const [payouts] = await conn.query(`SELECT * FROM payouts WHERE id = ? FOR UPDATE`, [Number(req.params.id)]);
    const payout = payouts[0];
    if (!payout) throw new HttpError(404, 'Payout not found');
    if (payout.status !== 'pending') throw new HttpError(400, 'Payout already processed');
    const [pro] = await conn.query(`SELECT user_id FROM service_professionals WHERE id = ?`, [payout.professional_id]);
    const proUserId = pro[0].user_id;
    const [wallet] = await conn.query(`SELECT * FROM wallets WHERE user_id = ? FOR UPDATE`, [proUserId]);
    if (Number(wallet[0].balance) < Number(payout.amount)) throw new HttpError(400, 'Professional wallet balance insufficient');
    await conn.query(`UPDATE wallets SET balance = balance - ? WHERE id = ?`, [payout.amount, wallet[0].id]);
    await conn.query(`UPDATE payouts SET status = 'released', released_at = NOW() WHERE id = ?`, [payout.id]);
    const { addLedger } = require('../services/wallet.service');
    const [after] = await conn.query(`SELECT balance FROM wallets WHERE id = ?`, [wallet[0].id]);
    await addLedger(conn, wallet[0].id, 'payout', payout.amount, null, 'Withdrawal to JazzCash/Easypaisa', after[0].balance);
  });
  res.json({ released: true });
}));

// ---- Categories management ----
router.get('/categories', ...adminOnly, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.*, (SELECT COUNT(*) FROM professional_categories pc WHERE pc.category_id = c.id) AS professionals,
            (SELECT COUNT(*) FROM bookings b WHERE b.category_id = c.id) AS bookings
     FROM categories c ORDER BY c.name`
  );
  res.json(rows);
}));

router.post('/categories', ...adminOnly, asyncHandler(async (req, res) => {
  const { name, description, icon } = req.body;
  if (!name) throw new HttpError(400, 'name required');
  const [res2] = await pool.query(`INSERT INTO categories (name, description, icon) VALUES (?, ?, ?)`, [name, description || null, icon || null]);
  res.status(201).json({ id: res2.insertId });
}));

router.put('/categories/:id', ...adminOnly, asyncHandler(async (req, res) => {
  const { name, description, is_active } = req.body;
  await pool.query(`UPDATE categories SET name = COALESCE(?, name), description = COALESCE(?, description), is_active = COALESCE(?, is_active) WHERE id = ?`, [
    name || null, description || null, is_active === undefined ? null : (is_active ? 1 : 0), Number(req.params.id),
  ]);
  res.json({ updated: true });
}));

// ---- Withdrawals admin approve/reject ----
router.get('/withdrawals', ...adminOnly, asyncHandler(async (req, res) => {
  const { adminList } = require('../services/withdrawal.service');
  res.json(await adminList());
}));

router.post('/withdrawals/:id/resolve', ...adminOnly, asyncHandler(async (req, res) => {
  const { adminResolve } = require('../services/withdrawal.service');
  res.json(await adminResolve(Number(req.params.id), req.body.action, req.body.note));
}));

// ---- Reports ----
router.get('/reports/commissions', ...adminOnly, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT DATE(calculated_at) AS day, COUNT(*) AS deals, SUM(amount) AS commission
     FROM commissions GROUP BY DATE(calculated_at) ORDER BY day DESC LIMIT 60`
  );
  res.json(rows);
}));

router.get('/reports/wallets', ...adminOnly, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.role, COUNT(*) AS wallets, SUM(w.balance) AS total_balance, SUM(w.held_amount) AS total_held
     FROM wallets w JOIN users u ON u.id = w.user_id GROUP BY u.role`
  );
  res.json(rows);
}));

// ---- Platform settings ----
router.get('/settings', ...adminOnly, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`SELECT * FROM platform_settings`);
  res.json(rows);
}));

router.post('/settings', ...adminOnly, asyncHandler(async (req, res) => {
  const entries = Object.entries(req.body || {});
  for (const [k, v] of entries) {
    await pool.query(`INSERT INTO platform_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`, [k, String(v)]);
  }
  res.json({ updated: entries.length });
}));

// =====================================================================
// Filtered + paginated data viewers (admin ko sab, filters ke sath)
// =====================================================================
function paging(req) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(100, Math.max(5, Number(req.query.per_page) || 15));
  return { page, perPage };
}
function pager(res, page, perPage, total) {
  res.set('X-Total-Count', String(total));
  return { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) || 0 };
}

// All wallets (per user) — search by name/phone, role filter
router.get('/wallets', ...adminOnly, asyncHandler(async (req, res) => {
  const { page, perPage } = paging(req);
  const where = ['1=1'];
  const params = [];
  if (req.query.role) { where.push('u.role = ?'); params.push(req.query.role); }
  if (req.query.q) { where.push('(u.phone LIKE ? OR COALESCE(c.full_name, sp.full_name) LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  const baseSql = `FROM wallets w
    JOIN users u ON u.id = w.user_id
    LEFT JOIN customers c ON c.user_id = u.id
    LEFT JOIN service_professionals sp ON sp.user_id = u.id
    WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${baseSql}`, params);
  const [rows] = await pool.query(
    `SELECT w.*, u.phone, u.role, u.status, COALESCE(c.full_name, sp.full_name) AS full_name,
       (SELECT COALESCE(SUM(amount),0) FROM professional_penalties pp JOIN service_professionals p2 ON p2.id = pp.professional_id WHERE p2.user_id = u.id AND pp.settled = 0) AS pending_penalty
     ${baseSql} ORDER BY w.balance DESC LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage]
  );
  res.json({ rows, pagination: pager(res, page, perPage, total) });
}));

// All wallet transactions — filters: user_id, type, direction, date; pagination
router.get('/wallet-transactions', ...adminOnly, asyncHandler(async (req, res) => {
  const { page, perPage } = paging(req);
  const where = ['1=1'];
  const params = [];
  if (req.query.user_id) { where.push('w.user_id = ?'); params.push(Number(req.query.user_id)); }
  if (req.query.type) { where.push('t.type = ?'); params.push(req.query.type); }
  if (req.query.direction === 'in') where.push(`t.type IN ('topup','refund','payout')`);
  if (req.query.direction === 'out') where.push(`t.type IN ('hold','release','penalty','commission')`);
  if (req.query.from) { where.push('DATE(t.created_at) >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('DATE(t.created_at) <= ?'); params.push(req.query.to); }
  const baseSql = `FROM wallet_transactions t
    JOIN wallets w ON w.id = t.wallet_id
    JOIN users u ON u.id = w.user_id
    LEFT JOIN customers c ON c.user_id = u.id
    LEFT JOIN service_professionals sp ON sp.user_id = u.id
    LEFT JOIN bookings b ON b.id = t.related_booking_id
    WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${baseSql}`, params);
  const [rows] = await pool.query(
    `SELECT t.*, w.user_id, u.phone, u.role, COALESCE(c.full_name, sp.full_name) AS owner_name, b.booking_code
     ${baseSql} ORDER BY t.id DESC LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage]
  );
  res.json({ rows, pagination: pager(res, page, perPage, total) });
}));

// All top-ups — filters: status, provider
router.get('/topups', ...adminOnly, asyncHandler(async (req, res) => {
  const { page, perPage } = paging(req);
  const where = ['1=1'];
  const params = [];
  if (req.query.status) { where.push('t.status = ?'); params.push(req.query.status); }
  if (req.query.provider) { where.push('t.provider = ?'); params.push(req.query.provider); }
  const baseSql = `FROM wallet_topups t JOIN users u ON u.id = t.user_id
    LEFT JOIN customers c ON c.user_id = u.id LEFT JOIN service_professionals sp ON sp.user_id = u.id
    WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${baseSql}`, params);
  const [rows] = await pool.query(
    `SELECT t.*, u.phone, COALESCE(c.full_name, sp.full_name) AS user_name
     ${baseSql} ORDER BY t.id DESC LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage]
  );
  res.json({ rows, pagination: pager(res, page, perPage, total) });
}));

// All penalties (owed + settled) — pro cancel ke negative entries
router.get('/penalties', ...adminOnly, asyncHandler(async (req, res) => {
  const { page, perPage } = paging(req);
  const where = ['1=1'];
  const params = [];
  if (req.query.settled === '0' || req.query.settled === '1') { where.push('pp.settled = ?'); params.push(Number(req.query.settled)); }
  if (req.query.professional_id) { where.push('pp.professional_id = ?'); params.push(Number(req.query.professional_id)); }
  const baseSql = `FROM professional_penalties pp
    JOIN service_professionals sp ON sp.id = pp.professional_id
    LEFT JOIN bookings b ON b.id = pp.booking_id
    WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${baseSql}`, params);
  const [rows] = await pool.query(
    `SELECT pp.*, sp.full_name, b.booking_code
     ${baseSql} ORDER BY pp.settled ASC, pp.id DESC LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage]
  );
  res.json({ rows, pagination: pager(res, page, perPage, total) });
}));

// All bookings — filters: status, urgent, search code/name; pagination
router.get('/bookings', ...adminOnly, asyncHandler(async (req, res) => {
  const { page, perPage } = paging(req);
  const where = ['1=1'];
  const params = [];
  if (req.query.status) { where.push('b.status = ?'); params.push(req.query.status); }
  if (req.query.urgent === '1') where.push('b.is_urgent = 1');
  if (req.query.q) { where.push('(b.booking_code LIKE ? OR cu.full_name LIKE ? OR sp.full_name LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`); }
  const baseSql = `FROM bookings b
    JOIN categories cat ON cat.id = b.category_id
    JOIN customers cu ON cu.id = b.customer_id
    JOIN service_professionals sp ON sp.id = b.professional_id
    WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${baseSql}`, params);
  const [rows] = await pool.query(
    `SELECT b.*, cat.name AS category_name, cu.full_name AS customer_name, sp.full_name AS professional_name
     ${baseSql} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage]
  );
  res.json({ rows, pagination: pager(res, page, perPage, total) });
}));

// All messages (chat audit) — flagged filter + pagination, sender names ke sath
router.get('/messages', ...adminOnly, asyncHandler(async (req, res) => {
  const { page, perPage } = paging(req);
  const where = ['1=1'];
  const params = [];
  if (req.query.flagged === '1') where.push('m.flagged = 1');
  if (req.query.booking_id) { where.push('m.booking_id = ?'); params.push(Number(req.query.booking_id)); }
  const baseSql = `FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN bookings b ON b.id = m.booking_id
    LEFT JOIN customers c ON c.user_id = u.id
    LEFT JOIN service_professionals sp ON sp.user_id = u.id
    WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${baseSql}`, params);
  const [rows] = await pool.query(
    `SELECT m.*, COALESCE(c.full_name, sp.full_name) AS sender_name, u.role AS sender_role, b.booking_code
     ${baseSql} ORDER BY m.id DESC LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage]
  );
  res.json({ rows, pagination: pager(res, page, perPage, total) });
}));

// All refunds — kya refund hua, kis rule par
router.get('/refunds', ...adminOnly, asyncHandler(async (req, res) => {
  const { page, perPage } = paging(req);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM refunds r JOIN bookings b ON b.id = r.booking_id`);
  const [rows] = await pool.query(
    `SELECT r.*, b.booking_code, cu.full_name AS customer_name, sp.full_name AS professional_name
     FROM refunds r JOIN bookings b ON b.id = r.booking_id
     JOIN customers cu ON cu.id = b.customer_id
     JOIN service_professionals sp ON sp.id = b.professional_id
     ORDER BY r.id DESC LIMIT ? OFFSET ?`,
    [perPage, (page - 1) * perPage]
  );
  res.json({ rows, pagination: pager(res, page, perPage, total) });
}));

module.exports = router;
