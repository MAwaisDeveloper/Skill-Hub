const router = require('express').Router();
const { pool } = require('../config/db');
const { asyncHandler, HttpError } = require('../middleware/error');
const { authenticate, requireRole } = require('../middleware/auth');
const bookingService = require('../services/booking.service');
const chatService = require('../services/chat.service');
const contractService = require('../services/contract.service');
const paymentService = require('../services/payment.service');
const notificationService = require('../services/notification.service');

const customerOnly = [authenticate, requireRole('customer')];

// ---- Profile & addresses ----
router.get('/me/profile', ...customerOnly, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`SELECT * FROM customers WHERE user_id = ?`, [req.user.id]);
  res.json(rows[0]);
}));

router.put('/me/profile', ...customerOnly, asyncHandler(async (req, res) => {
  const { full_name, profile_photo, preferred_language } = req.body;
  await pool.query(`UPDATE customers SET full_name = COALESCE(?, full_name), profile_photo = COALESCE(?, profile_photo) WHERE user_id = ?`, [full_name || null, profile_photo || null, req.user.id]);
  if (preferred_language) await pool.query(`UPDATE users SET preferred_language = ? WHERE id = ?`, [preferred_language, req.user.id]);
  res.json({ updated: true });
}));

router.get('/me/addresses', ...customerOnly, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.* FROM customer_addresses a JOIN customers c ON c.id = a.customer_id WHERE c.user_id = ? ORDER BY a.is_default DESC`,
    [req.user.id]
  );
  res.json(rows);
}));

router.post('/me/addresses', ...customerOnly, asyncHandler(async (req, res) => {
  const { label, city, area, full_address, latitude, longitude, is_default } = req.body;
  if (!full_address) throw new HttpError(400, 'full_address required');
  const [cust] = await pool.query(`SELECT id FROM customers WHERE user_id = ?`, [req.user.id]);
  const [res2] = await pool.query(
    `INSERT INTO customer_addresses (customer_id, label, city, area, full_address, latitude, longitude, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [cust[0].id, label || 'home', city || 'Lahore', area || null, full_address, latitude || null, longitude || null, is_default ? 1 : 0]
  );
  res.status(201).json({ id: res2.insertId });
}));

// ---- Categories & search ----
router.get('/categories', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`SELECT * FROM categories WHERE is_active = 1 ORDER BY name`);
  res.json(rows);
}));

router.get('/professionals/search', authenticate, asyncHandler(async (req, res) => {
  const results = await bookingService.searchProfessionals(req.query);
  res.json(results);
}));

router.get('/professionals/:id', authenticate, asyncHandler(async (req, res) => {
  res.json(await bookingService.getProfessionalProfile(req.params.id));
}));

// ---- Bookings lifecycle ----
router.post('/bookings', ...customerOnly, asyncHandler(async (req, res) => {
  res.status(201).json(await bookingService.createBooking(req.user.id, req.body));
}));

router.post('/bookings/:id/pay', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await bookingService.payBooking(req.user.id, Number(req.params.id)));
}));

router.post('/bookings/:id/confirm-arrival', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await bookingService.customerConfirmArrival(req.user.id, Number(req.params.id), req.body.otp));
}));

router.post('/bookings/:id/confirm-complete', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await bookingService.customerConfirmComplete(req.user.id, Number(req.params.id)));
}));

router.post('/bookings/:id/dispute', ...customerOnly, asyncHandler(async (req, res) => {
  if (!req.body.description) throw new HttpError(400, 'description required');
  res.json(await bookingService.customerDispute(req.user.id, Number(req.params.id), req.body.description));
}));

router.post('/bookings/:id/cancel', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await bookingService.cancelBooking(req.user.id, 'customer', Number(req.params.id)));
}));

// Offer respond: professional ka counter-offer accept (deal finalize) ya reject
router.post('/bookings/:id/offer/respond', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await bookingService.respondOffer(req.user.id, Number(req.params.id), !!req.body.accept));
}));

// Late approval: customer ne kaha "theek hai, aa jao" => kisi ke paise nahi katte
router.post('/bookings/:id/late-approve', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await bookingService.lateApprove(req.user.id, Number(req.params.id)));
}));

// Live location share (browser geolocation se)
router.post('/bookings/:id/location', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await bookingService.shareLocation(req.user.id, 'customer', Number(req.params.id), req.body));
}));

// Preview BEFORE canceling: exact breakdown of kya wapas milega / kya cut hoga (Section 10.1)
router.get('/bookings/:id/cancel-preview', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await bookingService.getCancelPreview(req.user.id, 'customer', Number(req.params.id)));
}));

router.get('/bookings', ...customerOnly, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT b.*, c.name AS category_name, sp.full_name AS professional_name, sp.profile_photo AS professional_photo,
            sp.average_rating AS professional_rating
     FROM bookings b
     JOIN categories c ON c.id = b.category_id
     JOIN service_professionals sp ON sp.id = b.professional_id
     JOIN customers cu ON cu.id = b.customer_id
     WHERE cu.user_id = ? ORDER BY b.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
}));

router.get('/bookings/:id', ...customerOnly, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT b.*, c.name AS category_name, sp.full_name AS professional_name, u.phone AS professional_phone_masked, sp.average_rating
     FROM bookings b
     JOIN categories c ON c.id = b.category_id
     JOIN service_professionals sp ON sp.id = b.professional_id
     JOIN users u ON u.id = sp.user_id
     JOIN customers cu ON cu.id = b.customer_id JOIN users cuu ON cuu.id = cu.user_id
     WHERE b.id = ? AND cuu.id = ?`,
    [Number(req.params.id), req.user.id]
  );
  if (!rows.length) throw new HttpError(404, 'Booking not found');
  const booking = rows[0];
  const [events] = await pool.query(`SELECT * FROM booking_events WHERE booking_id = ? ORDER BY id ASC`, [booking.id]);
  res.json({ ...booking, timeline: events });
}));

// ---- Reviews (completed bookings only) ----
router.post('/bookings/:id/review', ...customerOnly, asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;
  const bookingId = Number(req.params.id);
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'rating 1-5 required');
  const [rows] = await pool.query(
    `SELECT b.* FROM bookings b JOIN customers c ON c.id = b.customer_id WHERE b.id = ? AND c.user_id = ?`,
    [bookingId, req.user.id]
  );
  const booking = rows[0];
  if (!booking) throw new HttpError(404, 'Booking not found');
  if (booking.status !== 'completed') throw new HttpError(400, 'Reviews allowed only on completed bookings');
  await pool.query(
    `INSERT INTO reviews (booking_id, customer_id, professional_id, rating, comment) VALUES (?, (SELECT id FROM customers WHERE user_id = ?), ?, ?, ?)
     ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)`,
    [bookingId, req.user.id, booking.professional_id, rating, comment || null]
  );
  await pool.query(
    `UPDATE service_professionals SET average_rating = (SELECT ROUND(AVG(rating), 2) FROM reviews WHERE professional_id = ?) WHERE id = ?`,
    [booking.professional_id, booking.professional_id]
  );
  res.json({ ok: true });
}));

// ---- Chat ----
router.post('/bookings/:id/messages', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await chatService.sendMessage(req.user.id, Number(req.params.id), req.body.text));
}));

router.get('/bookings/:id/messages', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await chatService.getMessages(req.user.id, Number(req.params.id)));
}));

// ---- Wallet & payments ----
router.get('/wallet', ...customerOnly, asyncHandler(async (req, res) => {
  const walletService = require('../services/wallet.service');
  res.json(await walletService.getWallet(req.user.id));
}));

router.get('/wallet/transactions', ...customerOnly, asyncHandler(async (req, res) => {
  const walletService = require('../services/wallet.service');
  res.json(await walletService.getTransactions(req.user.id));
}));

// JazzCash-style statement: incoming/outgoing/pending summary + filters + pagination
router.get('/wallet/statement', ...customerOnly, asyncHandler(async (req, res) => {
  const walletService = require('../services/wallet.service');
  res.json(await walletService.getStatement(req.user.id, req.query));
}));

// Customer withdrawal: wallet -> JazzCash/Easypaisa (admin approves transfer)
router.post('/wallet/withdraw', ...customerOnly, asyncHandler(async (req, res) => {
  const { requestWithdrawal } = require('../services/withdrawal.service');
  res.json(await requestWithdrawal(req.user.id, 'customer', req.body));
}));

router.get('/wallet/withdrawals', ...customerOnly, asyncHandler(async (req, res) => {
  const { listMine } = require('../services/withdrawal.service');
  res.json(await listMine(req.user.id));
}));

router.post('/wallet/topup', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await paymentService.initiateTopup(req.user.id, req.body));
}));

// Account title check: number par jis ka naam hai (ya Not Found) — top-up se pehle confirm karne ke liye
router.post('/wallet/account-title', ...customerOnly, asyncHandler(async (req, res) => {
  const { provider, mobile_number } = req.body;
  const { lookupAccountTitle } = require('../services/lookup.service');
  res.json(await lookupAccountTitle(provider || 'jazzcash', mobile_number));
}));

// Simulated gateway hosted page POST -> processes payment (dev only; production uses gateway callback)
router.post('/wallet/topup/:reference/confirm', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await paymentService.gatewayCallback({ reference: req.params.reference, status: req.body.status || 'success' }));
}));

router.get('/wallet/topup/:reference', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await paymentService.getTopupStatus(req.user.id, req.params.reference));
}));

// ---- Contracts (Section 11) ----
router.post('/contracts', ...customerOnly, asyncHandler(async (req, res) => {
  res.status(201).json(await contractService.createContract(req.user.id, req.body));
}));

router.get('/contracts', ...customerOnly, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT ct.*, c.name AS category_name, (SELECT COUNT(*) FROM contract_bids cb WHERE cb.contract_id = ct.id) AS bid_count
     FROM contracts ct JOIN categories c ON c.id = ct.category_id
     JOIN customers cu ON cu.id = ct.customer_id WHERE cu.user_id = ? ORDER BY ct.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
}));

router.get('/contracts/:id/bids', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await contractService.listBids(req.user.id, Number(req.params.id)));
}));

router.post('/contracts/:id/award/:bidId', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await contractService.awardContract(req.user.id, Number(req.params.id), Number(req.params.bidId)));
}));

// Awarded contract ke milestones (release progress ke sath)
router.get('/contracts/:id/milestones', ...customerOnly, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT cm.* FROM contract_milestones cm
     JOIN contracts ct ON ct.id = cm.contract_id
     JOIN customers cu ON cu.id = ct.customer_id
     WHERE cm.contract_id = ? AND cu.user_id = ? ORDER BY cm.milestone_no`,
    [Number(req.params.id), req.user.id]
  );
  res.json(rows);
}));

// Milestone confirm & release: escrow -> commission cut -> pro wallet (Section 11)
router.post('/contracts/:id/milestones/:no/release', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await contractService.releaseMilestone(req.user.id, Number(req.params.id), Number(req.params.no)));
}));

// ---- Notifications ----
router.get('/notifications', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await notificationService.list(req.user.id, req.query));
}));

router.post('/notifications/:id/read', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await notificationService.markRead(req.user.id, Number(req.params.id)));
}));

router.post('/notifications/read-all', ...customerOnly, asyncHandler(async (req, res) => {
  res.json(await notificationService.markAllRead(req.user.id));
}));

module.exports = router;
