const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { HttpError, asyncHandler } = require('../middleware/error');
const { signToken, authenticate } = require('../middleware/auth');
const { normalizePhone, isValidPhone, issueOtp, verifyOtp } = require('../utils/helpers');
const { validate, phoneRule } = require('../middleware/validators');
const verificationService = require('../services/verification.service');

// ---- Register (customer or professional) — password + email abhi se set hota hai ----
router.post('/register', asyncHandler(async (req, res) => {
  const { role, full_name, phone, email, password, preferred_language } = req.body;
  if (!['customer', 'professional'].includes(role)) throw new HttpError(400, 'role must be customer or professional');
  const normPhone = normalizePhone(phone);
  if (!isValidPhone(normPhone)) throw new HttpError(400, 'Invalid Pakistani mobile number (03XXXXXXXXX)');
  if (!full_name || !String(full_name).trim()) throw new HttpError(400, 'Full name required');
  if (password && String(password).length < 8) throw new HttpError(400, 'Password min 8 characters');

  const [existing] = await pool.query(`SELECT id FROM users WHERE phone = ?`, [normPhone]);
  if (existing.length) throw new HttpError(409, 'This phone is already registered. Please login.');

  const hash = password ? bcrypt.hashSync(String(password), 10) : null;
  const [res2] = await pool.query(
    `INSERT INTO users (phone, email, password_hash, role, preferred_language) VALUES (?, ?, ?, ?, ?)`,
    [normPhone, email || null, hash, role, preferred_language === 'ur' ? 'ur' : 'en']
  );
  const userId = res2.insertId;

  if (role === 'customer') {
    await pool.query(`INSERT INTO customers (user_id, full_name) VALUES (?, ?)`, [userId, String(full_name).trim()]);
    await pool.query(`INSERT IGNORE INTO wallets (user_id) VALUES (?)`, [userId]);
    await pool.query(`INSERT INTO trust_scores (user_id, role, score) VALUES (?, 'customer', 100)`, [userId]);
  } else {
    await pool.query(`INSERT IGNORE INTO wallets (user_id) VALUES (?)`, [userId]);
  }
  const otpRes = await issueOtp(normPhone);
  res.status(201).json({
    user_id: userId, role, phone: normPhone,
    message: 'Registered. OTP sent to your phone (check server console in dev).',
    dev_otp: otpRes.devCode,
  });
}));

// ---- Professional profile + documents (Section 3) ----
router.post('/professional/profile', authenticate, asyncHandler(async (req, res) => {
  const result = await verificationService.registerProfessional({ user: req.user, ...req.body });
  res.json(result);
}));

router.post('/professional/documents', authenticate, asyncHandler(async (req, res) => {
  const [pros] = await pool.query(`SELECT id FROM service_professionals WHERE user_id = ?`, [req.user.id]);
  if (!pros.length) throw new HttpError(400, 'Complete your professional profile first');
  const result = await verificationService.uploadDocuments(pros[0].id, req.body);
  res.json(result);
}));

// ---- OTP request & verify (login fallback) ----
router.post('/otp/request', validate([phoneRule]), asyncHandler(async (req, res) => {
  const normPhone = normalizePhone(req.body.phone);
  const [users] = await pool.query(`SELECT * FROM users WHERE phone = ?`, [normPhone]);
  if (!users.length) throw new HttpError(404, 'No account found for this phone. Please register.');
  const otpRes = await issueOtp(normPhone);
  res.json({ message: 'OTP sent', dev_otp: otpRes.devCode });
}));

router.post('/otp/verify', validate([phoneRule]), asyncHandler(async (req, res) => {
  const normPhone = normalizePhone(req.body.phone);
  await verifyOtp(normPhone, req.body.otp);
  const [users] = await pool.query(`SELECT * FROM users WHERE phone = ?`, [normPhone]);
  const user = users[0];
  if (user.status !== 'active') throw new HttpError(403, 'Account suspended. Contact support.');
  const token = await finalizeLogin(user);
  res.json(token);
}));

// ---- Password login: email YA phone dono chalte hain (primary login) ----
router.post('/password/login', asyncHandler(async (req, res) => {
  const { identifier, phone, email, password } = req.body;
  let user = null;
  const idf = String(identifier || phone || email || '').trim();
  if (!idf || !password) throw new HttpError(400, 'Email/phone aur password dono zaroori hain');

  if (/^03\d{9}$/.test(normalizePhone(idf))) {
    const [rows] = await pool.query(`SELECT * FROM users WHERE phone = ?`, [normalizePhone(idf)]);
    user = rows[0];
  } else {
    const [rows] = await pool.query(`SELECT * FROM users WHERE email = ?`, [idf.toLowerCase()]);
    user = rows[0];
  }
  if (!user || !user.password_hash || !bcrypt.compareSync(String(password), user.password_hash)) {
    throw new HttpError(401, 'Invalid email/phone or password');
  }
  if (user.status !== 'active') throw new HttpError(403, 'Account suspended');
  const token = await finalizeLogin(user);
  res.json(token);
}));

// ---- Forgot password: phone ya email do -> OTP issue ----
router.post('/forgot', asyncHandler(async (req, res) => {
  const idf = String(req.body.identifier || req.body.phone || req.body.email || '').trim();
  if (!idf) throw new HttpError(400, 'Apna registered phone ya email likhein');
  let user = null;
  if (/^03\d{9}$/.test(normalizePhone(idf))) {
    const [rows] = await pool.query(`SELECT * FROM users WHERE phone = ?`, [normalizePhone(idf)]);
    user = rows[0];
  } else {
    const [rows] = await pool.query(`SELECT * FROM users WHERE email = ?`, [idf.toLowerCase()]);
    user = rows[0];
  }
  if (!user) throw new HttpError(404, 'Is identifier se koi account nahi mila');
  const otpRes = await issueOtp(user.phone);
  res.json({ message: `OTP bhej diya gaya hai ${user.phone} par (dev: console)`, phone: user.phone, dev_otp: otpRes.devCode });
}));

// ---- Reset password with OTP ----
router.post('/reset', asyncHandler(async (req, res) => {
  const { phone, otp, new_password } = req.body;
  if (!new_password || String(new_password).length < 8) throw new HttpError(400, 'New password min 8 characters');
  const normPhone = normalizePhone(phone);
  await verifyOtp(normPhone, otp); // throws on wrong/expired
  await pool.query(`UPDATE users SET password_hash = ? WHERE phone = ?`, [bcrypt.hashSync(String(new_password), 10), normPhone]);
  res.json({ updated: true, message: 'Password reset ho gaya — ab naye password se login karein' });
}));

// shared login finalization (wallet, trust score, profile, token)
async function finalizeLogin(user) {
  await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = ?`, [user.id]);
  await pool.query(`INSERT IGNORE INTO wallets (user_id) VALUES (?)`, [user.id]);
  await pool.query(`INSERT INTO trust_scores (user_id, role, score) VALUES (?, ?, 100) ON DUPLICATE KEY UPDATE score = score`, [user.id, user.role]);
  let profile = null;
  if (user.role === 'customer') {
    const [p] = await pool.query(`SELECT * FROM customers WHERE user_id = ?`, [user.id]);
    profile = p[0] || null;
  } else if (user.role === 'professional') {
    const [p] = await pool.query(`SELECT id, full_name, verification_status, average_rating, completed_jobs FROM service_professionals WHERE user_id = ?`, [user.id]);
    profile = p[0] || null;
  }
  const token = signToken(user);
  return { token, user: { id: user.id, phone: user.phone, email: user.email, role: user.role, preferred_language: user.preferred_language }, profile };
}

// ---- Update my account (email, language) ----
router.put('/me', authenticate, asyncHandler(async (req, res) => {
  const { email, preferred_language } = req.body;
  await pool.query(`UPDATE users SET email = COALESCE(?, email), preferred_language = COALESCE(?, preferred_language) WHERE id = ?`, [
    email === undefined ? null : (email || null),
    preferred_language === 'ur' || preferred_language === 'en' ? preferred_language : null,
    req.user.id,
  ]);
  res.json({ updated: true });
}));

// ---- Admin login (password) ----
router.post('/admin/login', asyncHandler(async (req, res) => {
  const { phone, password } = req.body;
  const [users] = await pool.query(`SELECT * FROM users WHERE phone = ? AND role = 'admin'`, [normalizePhone(phone)]);
  const user = users[0];
  if (!user || !user.password_hash || !bcrypt.compareSync(password || '', user.password_hash)) {
    throw new HttpError(401, 'Invalid admin credentials');
  }
  const token = signToken(user);
  res.json({ token, user: { id: user.id, phone: user.phone, role: 'admin' } });
}));

// ---- Change / set password ----
router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!new_password || String(new_password).length < 8) throw new HttpError(400, 'New password min 8 characters');
  const [users] = await pool.query(`SELECT password_hash FROM users WHERE id = ?`, [req.user.id]);
  const hash = users[0].password_hash;
  if (hash) {
    if (!current_password || !bcrypt.compareSync(current_password, hash)) throw new HttpError(401, 'Current password galat hai');
  }
  await pool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [bcrypt.hashSync(new_password, 10), req.user.id]);
  res.json({ updated: true, message: 'Password saved. Ab email/phone + password se bhi login kar sakte hain.' });
}));

// ---- Me ----
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const [users] = await pool.query(`SELECT id, phone, email, role, status, preferred_language FROM users WHERE id = ?`, [req.user.id]);
  const user = users[0];
  if (user.role === 'customer') {
    const [p] = await pool.query(`SELECT * FROM customers WHERE user_id = ?`, [user.id]);
    user.profile = p[0] || null;
  } else if (user.role === 'professional') {
    const [p] = await pool.query(`SELECT * FROM service_professionals WHERE user_id = ?`, [user.id]);
    user.profile = p[0] || null;
  }
  res.json({ user });
}));

module.exports = router;
