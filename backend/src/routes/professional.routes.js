const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/db');
const { asyncHandler, HttpError } = require('../middleware/error');
const { authenticate, requireRole } = require('../middleware/auth');
const bookingService = require('../services/booking.service');
const chatService = require('../services/chat.service');
const contractService = require('../services/contract.service');
const walletService = require('../services/wallet.service');
const notificationService = require('../services/notification.service');

const proOnly = [authenticate, requireRole('professional')];

// ---- CNIC document uploads (files, not URLs) ----
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// File-upload verification documents with automatic validation:
//  - JPG/PNG only, <=5MB, min dimensions
//  - Front & Back must be CNIC-card ratio (landscape ~1.3-1.9)
//  - Selfie must be portrait (live photo), Profile any
//  - Front != Back, Selfie != Front/Back (duplicate check)
router.post('/documents/upload', proOnly, upload.fields([
  { name: 'cnic_front', maxCount: 1 },
  { name: 'cnic_back', maxCount: 1 },
  { name: 'selfie', maxCount: 1 },
  { name: 'profile_photo', maxCount: 1 },
]), asyncHandler(async (req, res) => {
  const proId = await getProId(req.user.id);
  const [pros] = await pool.query(`SELECT full_name FROM service_professionals WHERE id = ?`, [proId]);
  const files = req.files || {};
  const front = files.cnic_front?.[0];
  const back = files.cnic_back?.[0];
  const selfie = files.selfie?.[0];
  const profile = files.profile_photo?.[0];
  if (!front || !back || !selfie) throw new HttpError(400, 'CNIC Front, CNIC Back aur Live Selfie — teeno images required hain');

  const { validateImageBuffer } = require('../utils/imageCheck');
  const f = validateImageBuffer(front.buffer, { label: 'CNIC Front', expectRatio: { min: 1.3, max: 1.9 } });
  const b = validateImageBuffer(back.buffer, { label: 'CNIC Back', expectRatio: { min: 1.3, max: 1.9 } });
  const s = validateImageBuffer(selfie.buffer, { label: 'Selfie', minRatio: null, maxRatio: 1.1 });
  const p = profile ? validateImageBuffer(profile.buffer, { label: 'Profile Photo' }) : null;

  if (f.hash === b.hash) throw new HttpError(400, 'Validation Error: CNIC Front aur Back same image hai — dono alag sides upload karein');
  if (s.hash === f.hash) throw new HttpError(400, 'Validation Error: Selfie CNIC Front wali image nahi ho sakti — live selfie lein');
  if (s.hash === b.hash) throw new HttpError(400, 'Validation Error: Selfie CNIC Back wali image nahi ho sakti — live selfie lein');
  if (p && p.hash === f.hash) throw new HttpError(400, 'Validation Error: Profile photo CNIC front se same hai');

  // save files
  const saved = {};
  const write = (file, name) => {
    const ext = file.mimetype === 'image/png' ? '.png' : '.jpg';
    const filename = `${proId}_${name}_${Date.now()}${ext}`;
    fs.writeFileSync(path.join(uploadDir, filename), file.buffer);
    saved[name] = `/uploads/${filename}`;
  };
  write(front, 'cnic_front');
  write(back, 'cnic_back');
  write(selfie, 'selfie');
  if (profile) write(profile, 'profile_photo');

  await pool.query(
    `UPDATE service_professionals SET cnic_front_photo = ?, cnic_back_photo = ?, selfie_photo = ?,
       profile_photo = COALESCE(?, profile_photo) WHERE id = ?`,
    [saved.cnic_front, saved.cnic_back, saved.selfie, saved.profile_photo || null, proId]
  );

  res.json({
    uploaded: true,
    files: saved,
    checks: {
      front: `${f.dims.width}x${f.dims.height} (CNIC ratio ✓)`,
      back: `${b.dims.width}x${b.dims.height} (CNIC ratio ✓)`,
      selfie: `${s.dims.width}x${s.dims.height} (portrait ✓)`,
      duplicates: 'none ✓',
    },
    message: `Documents validated & saved. Admin will manually match ${pros[0].full_name} ke naam se CNIC + selfie.`,
  });
}));

async function getProId(userId) {
  const [rows] = await pool.query(`SELECT id FROM service_professionals WHERE user_id = ?`, [userId]);
  if (!rows.length) throw new HttpError(400, 'Complete your professional profile first');
  return rows[0].id;
}

// ---- Public-ish profile & dashboard ----
router.get('/me/dashboard', ...proOnly, asyncHandler(async (req, res) => {
  const proId = await getProId(req.user.id);
  const [rows] = await pool.query(`SELECT * FROM service_professionals WHERE id = ?`, [proId]);
  const [stats] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM bookings WHERE professional_id = ? AND status = 'waiting_for_professional') AS new_requests,
       (SELECT COUNT(*) FROM bookings WHERE professional_id = ? AND status IN ('accepted','on_the_way','arrived','work_started')) AS active_jobs,
       (SELECT COALESCE(SUM(amount),0) FROM payouts WHERE professional_id = ? AND status = 'released') AS total_earned,
       (SELECT COALESCE(SUM(amount),0) FROM professional_penalties WHERE professional_id = ? AND settled = 0) AS outstanding_penalties`,
    [proId, proId, proId, proId]
  );
  res.json({ profile: rows[0], stats: stats[0] });
}));

router.put('/me/profile', ...proOnly, asyncHandler(async (req, res) => {
  const proId = await getProId(req.user.id);
  const { bio, experience_years, payout_account, payout_provider, profile_photo, available_now, base_pricing_json } = req.body;
  await pool.query(
    `UPDATE service_professionals SET bio = COALESCE(?, bio), experience_years = COALESCE(?, experience_years),
       payout_account = COALESCE(?, payout_account), payout_provider = COALESCE(?, payout_provider),
       profile_photo = COALESCE(?, profile_photo), available_now = COALESCE(?, available_now),
       base_pricing_json = COALESCE(?, base_pricing_json)
     WHERE id = ?`,
    [bio ?? null, experience_years ?? null, payout_account ?? null, payout_provider ?? null, profile_photo ?? null,
     available_now === undefined ? null : (available_now ? 1 : 0), base_pricing_json ? JSON.stringify(base_pricing_json) : null, proId]
  );
  res.json({ updated: true });
}));

// ---- Availability slots ----
router.get('/me/slots', ...proOnly, asyncHandler(async (req, res) => {
  const proId = await getProId(req.user.id);
  const [rows] = await pool.query(
    `SELECT * FROM availability_slots WHERE professional_id = ? AND slot_date >= CURDATE() ORDER BY slot_date, start_time`,
    [proId]
  );
  res.json(rows);
}));

router.post('/me/slots', ...proOnly, asyncHandler(async (req, res) => {
  const proId = await getProId(req.user.id);
  const { slot_date, start_time, end_time } = req.body;
  if (!slot_date || !start_time || !end_time) throw new HttpError(400, 'slot_date, start_time, end_time required');
  const [res2] = await pool.query(
    `INSERT IGNORE INTO availability_slots (professional_id, slot_date, start_time, end_time) VALUES (?, ?, ?, ?)`,
    [proId, slot_date, start_time, end_time]
  );
  res.status(201).json({ added: res2.affectedRows });
}));

router.delete('/me/slots/:id', ...proOnly, asyncHandler(async (req, res) => {
  const proId = await getProId(req.user.id);
  const [res2] = await pool.query(
    `DELETE FROM availability_slots WHERE id = ? AND professional_id = ? AND is_booked = 0`,
    [Number(req.params.id), proId]
  );
  if (!res2.affectedRows) throw new HttpError(400, 'Slot not found or already booked');
  res.json({ deleted: true });
}));

// ---- Incoming bookings ----
router.get('/bookings', ...proOnly, asyncHandler(async (req, res) => {
  const proId = await getProId(req.user.id);
  const [rows] = await pool.query(
    `SELECT b.*, c.name AS category_name, cu.full_name AS customer_name, ca.full_address AS customer_address
     FROM bookings b
     JOIN categories c ON c.id = b.category_id
     JOIN customers cu ON cu.id = b.customer_id
     LEFT JOIN customer_addresses ca ON ca.id = b.address_id
     WHERE b.professional_id = ? ORDER BY b.created_at DESC`,
    [proId]
  );
  res.json(rows);
}));

router.get('/bookings/:id', ...proOnly, asyncHandler(async (req, res) => {
  const proId = await getProId(req.user.id);
  const [rows] = await pool.query(
    `SELECT b.*, c.name AS category_name, cu.full_name AS customer_name, ca.full_address AS customer_address
     FROM bookings b
     JOIN categories c ON c.id = b.category_id
     JOIN customers cu ON cu.id = b.customer_id
     LEFT JOIN customer_addresses ca ON ca.id = b.address_id
     WHERE b.id = ? AND b.professional_id = ?`,
    [Number(req.params.id), proId]
  );
  if (!rows.length) throw new HttpError(404, 'Booking not found');
  const [events] = await pool.query(`SELECT * FROM booking_events WHERE booking_id = ? ORDER BY id ASC`, [rows[0].id]);
  res.json({ ...rows[0], timeline: events });
}));

router.post('/bookings/:id/accept', ...proOnly, asyncHandler(async (req, res) => {
  res.json(await bookingService.proAccept(req.user.id, Number(req.params.id), { arrival_minutes: req.body.arrival_minutes }));
}));

// Counter-offer: apni price + timeline batao, customer accept/reject karega
router.post('/bookings/:id/offer', ...proOnly, asyncHandler(async (req, res) => {
  res.json(await bookingService.makeOffer(req.user.id, Number(req.params.id), req.body));
}));

// Late notify: "main late hoon" — customer approve kare to kisi ke paise nahi katte
router.post('/bookings/:id/late-notify', ...proOnly, asyncHandler(async (req, res) => {
  res.json(await bookingService.lateNotify(req.user.id, Number(req.params.id), req.body));
}));

// Live location share (browser geolocation se)
router.post('/bookings/:id/location', ...proOnly, asyncHandler(async (req, res) => {
  res.json(await bookingService.shareLocation(req.user.id, 'professional', Number(req.params.id), req.body));
}));

router.post('/bookings/:id/reject', ...proOnly, asyncHandler(async (req, res) => {
  res.json(await bookingService.proReject(req.user.id, Number(req.params.id), req.body.reason));
}));

router.post('/bookings/:id/status', ...proOnly, asyncHandler(async (req, res) => {
  res.json(await bookingService.proStatus(req.user.id, Number(req.params.id), req.body.status));
}));

// Professional cancel after accept: customer 100% refund + 10% penalty (owed) recorded
router.post('/bookings/:id/cancel', ...proOnly, asyncHandler(async (req, res) => {
  res.json(await bookingService.cancelBooking(req.user.id, 'professional', Number(req.params.id)));
}));

// Preview BEFORE canceling: customer refund + your penalty breakdown (Section 10.1)
router.get('/bookings/:id/cancel-preview', ...proOnly, asyncHandler(async (req, res) => {
  res.json(await bookingService.getCancelPreview(req.user.id, 'professional', Number(req.params.id)));
}));

// ---- Chat ----
router.post('/bookings/:id/messages', ...proOnly, asyncHandler(async (req, res) => {
  res.json(await chatService.sendMessage(req.user.id, Number(req.params.id), req.body.text));
}));

router.get('/bookings/:id/messages', ...proOnly, asyncHandler(async (req, res) => {
  res.json(await chatService.getMessages(req.user.id, Number(req.params.id)));
}));

// ---- Wallet ----
router.get('/wallet', ...proOnly, asyncHandler(async (req, res) => {
  res.json(await walletService.getWallet(req.user.id));
}));

router.get('/wallet/transactions', ...proOnly, asyncHandler(async (req, res) => {
  res.json(await walletService.getTransactions(req.user.id));
}));

// JazzCash-style statement: incoming/outgoing/pending + filters + pagination + penalties
router.get('/wallet/statement', ...proOnly, asyncHandler(async (req, res) => {
  res.json(await walletService.getStatement(req.user.id, req.query));
}));

// Penalties list (owed + settled) — professional ko pata ho kya kata ja raha hai
router.get('/wallet/penalties', ...proOnly, asyncHandler(async (req, res) => {
  const proId = await getProId(req.user.id);
  const [rows] = await pool.query(
    `SELECT pp.*, b.booking_code FROM professional_penalties pp
     LEFT JOIN bookings b ON b.id = pp.booking_id
     WHERE pp.professional_id = ? ORDER BY pp.settled ASC, pp.id DESC LIMIT 100`,
    [proId]
  );
  res.json(rows);
}));

// Payout account title check: number par jis ka naam hai wo show hota hai (ya Not Found)
router.post('/wallet/payout-title', ...proOnly, asyncHandler(async (req, res) => {
  const { provider, account_number } = req.body;
  const { lookupAccountTitle } = require('../services/lookup.service');
  res.json(await lookupAccountTitle(provider || 'jazzcash', account_number));
}));

// Payout request: wallet -> JazzCash/Easypaisa account (admin approves)
router.post('/wallet/withdraw', ...proOnly, asyncHandler(async (req, res) => {
  const { requestWithdrawal } = require('../services/withdrawal.service');
  const result = await requestWithdrawal(req.user.id, 'professional', req.body);
  // also remember as default payout account
  await pool.query(`UPDATE service_professionals SET payout_account = ?, payout_provider = ? WHERE id = ?`, [req.body.account_number, req.body.provider, await getProId(req.user.id)]);
  res.json(result);
}));

router.get('/wallet/withdrawals', ...proOnly, asyncHandler(async (req, res) => {
  const { listMine } = require('../services/withdrawal.service');
  res.json(await listMine(req.user.id));
}));

// Payouts ledger — job payouts + contract milestone payouts (invoiciable)
router.get('/payouts', ...proOnly, asyncHandler(async (req, res) => {
  const proId = await getProId(req.user.id);
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = 15;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM payouts WHERE professional_id = ?`, [proId]);
  const [rows] = await pool.query(
    `SELECT p.*, b.booking_code, c.name AS category_name
     FROM payouts p
     LEFT JOIN bookings b ON b.id = p.booking_id
     LEFT JOIN categories c ON c.id = b.category_id
     WHERE p.professional_id = ? ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    [proId, perPage, (page - 1) * perPage]
  );
  res.json({ rows, pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) } });
}));

// ---- Contracts ----
router.get('/contracts', ...proOnly, asyncHandler(async (req, res) => {
  const proId = await getProId(req.user.id);
  const base = `SELECT ct.*, c.name AS category_name,
     (SELECT cb.status FROM contract_bids cb WHERE cb.contract_id = ct.id AND cb.professional_id = ? LIMIT 1) AS my_bid_status,
     (SELECT cb.id FROM contract_bids cb WHERE cb.contract_id = ct.id AND cb.professional_id = ? LIMIT 1) AS my_bid_id,
     EXISTS (SELECT 1 FROM professional_categories pc WHERE pc.professional_id = ? AND pc.category_id = ct.category_id) AS matches_me
   FROM contracts ct JOIN categories c ON c.id = ct.category_id`;
  if (req.query.all === '1') {
    const [rows] = await pool.query(`${base} WHERE ct.status = 'open' ORDER BY matches_me DESC, ct.created_at DESC`, [proId, proId, proId]);
    return res.json(rows);
  }
  const [rows] = await pool.query(
    `${base}
     WHERE ct.status = 'open' AND (
       EXISTS (SELECT 1 FROM professional_categories pc WHERE pc.professional_id = ? AND pc.category_id = ct.category_id)
       OR NOT EXISTS (SELECT 1 FROM professional_categories pc WHERE pc.professional_id = ?)
     )
     ORDER BY ct.created_at DESC`,
    [proId, proId, proId, proId, proId]
  );
  // awarded/in-progress contracts jis mein mera selected bid hai
  const [mine] = await pool.query(
    `SELECT ct.*, c.name AS category_name, 'awarded' AS my_bid_status, 1 AS matches_me
     FROM contracts ct JOIN categories c ON c.id = ct.category_id
     WHERE ct.awarded_bid_id IN (SELECT id FROM contract_bids WHERE professional_id = ?) AND ct.status != 'open'`,
    [proId]
  );
  res.json([...rows, ...mine]);
}));

// Milestones of my awarded contract
router.get('/contracts/:id/milestones', ...proOnly, asyncHandler(async (req, res) => {
  const proId = await getProId(req.user.id);
  const [rows] = await pool.query(
    `SELECT cm.* FROM contract_milestones cm
     JOIN contracts ct ON ct.id = cm.contract_id
     JOIN contract_bids cb ON cb.id = ct.awarded_bid_id
     WHERE ct.id = ? AND cb.professional_id = ? ORDER BY cm.milestone_no`,
    [Number(req.params.id), proId]
  );
  res.json(rows);
}));

router.post('/contracts/:id/bid', ...proOnly, asyncHandler(async (req, res) => {
  res.json(await contractService.submitBid(req.user.id, Number(req.params.id), req.body));
}));

// ---- Reviews received ----
router.get('/reviews', ...proOnly, asyncHandler(async (req, res) => {
  const proId = await getProId(req.user.id);
  const [rows] = await pool.query(
    `SELECT r.*, b.booking_code FROM reviews r JOIN bookings b ON b.id = r.booking_id WHERE r.professional_id = ? ORDER BY r.created_at DESC LIMIT 50`,
    [proId]
  );
  res.json(rows);
}));

// ---- Notifications ----
router.get('/notifications', ...proOnly, asyncHandler(async (req, res) => {
  res.json(await notificationService.list(req.user.id, req.query));
}));

router.post('/notifications/read-all', ...proOnly, asyncHandler(async (req, res) => {
  res.json(await notificationService.markAllRead(req.user.id));
}));

module.exports = router;
