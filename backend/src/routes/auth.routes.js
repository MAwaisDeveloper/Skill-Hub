const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { HttpError, asyncHandler } = require('../middleware/error');
const { signToken, authenticate } = require('../middleware/auth');
const { normalizePhone, isValidPhone, issueOtp, verifyOtp } = require('../utils/helpers');
const { validate } = require('../middleware/validators');
const verificationService = require('../services/verification.service');

// ---- Register (customer or professional) — email + password required (email-first login) ----
router.post('/register', asyncHandler(async (req, res) => {
  const { role, full_name, phone, email, password, preferred_language } = req.body;
  if (!['customer', 'professional'].includes(role)) throw new HttpError(400, 'role must be customer or professional');
  const normPhone = normalizePhone(phone);
  if (!isValidPhone(normPhone)) throw new HttpError(400, 'Invalid Pakistani mobile number (03XXXXXXXXX)');
  if (!full_name || !String(full_name).trim()) throw new HttpError(400, 'Full name required');
  const normEmail = String(email || '').trim().toLowerCase();
  if (!/^[A-Za-z][^\s@]*@[^\s@]+\.[A-Za-z]{2,}$/.test(normEmail)) throw new HttpError(400, 'Valid email required (must start with an English letter)');
  if (password && String(password).length < 8) throw new HttpError(400, 'Password min 8 characters');

  const [existing] = await pool.query(`SELECT id FROM users WHERE phone = ?`, [normPhone]);
  if (existing.length) throw new HttpError(409, 'This phone is already registered. Please login.');
  const [existingEmail] = await pool.query(`SELECT id FROM users WHERE email = ?`, [normEmail]);
  if (existingEmail.length) throw new HttpError(409, 'This email is already registered. Please login.');

  const hash = password ? bcrypt.hashSync(String(password), 10) : null;
  const [res2] = await pool.query(
    `INSERT INTO users (phone, email, password_hash, role, preferred_language) VALUES (?, ?, ?, ?, ?)`,
    [normPhone, normEmail, hash, role, preferred_language === 'ur' ? 'ur' : 'en']
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

// ---- OTP request & verify (email-first login; phone still supported internally) ----
router.post('/otp/request', asyncHandler(async (req, res) => {
  const { email } = req.body;
  let user = null;
  if (email) {
    const [rows] = await pool.query(`SELECT * FROM users WHERE email = ?`, [String(email).trim().toLowerCase()]);
    user = rows[0];
    if (!user) throw new HttpError(404, 'No account found for this email. Please register.');
  } else {
    const normPhone = normalizePhone(req.body.phone);
    if (!isValidPhone(normPhone)) throw new HttpError(400, 'Valid email or phone required');
    const [rows] = await pool.query(`SELECT * FROM users WHERE phone = ?`, [normPhone]);
    user = rows[0];
    if (!user) throw new HttpError(404, 'No account found for this phone. Please register.');
  }
  const otpRes = await issueOtp(user.phone);
  res.json({ message: 'OTP sent', sent_to: email ? user.email : user.phone, dev_otp: otpRes.devCode });
}));

router.post('/otp/verify', asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  let user = null;
  if (email && !req.body.phone) {
    const [rows] = await pool.query(`SELECT * FROM users WHERE email = ?`, [String(email).trim().toLowerCase()]);
    user = rows[0];
    if (!user) throw new HttpError(404, 'No account found for this email.');
    await verifyOtp(user.phone, otp);
  } else {
    const normPhone = normalizePhone(req.body.phone);
    await verifyOtp(normPhone, otp);
    const [rows] = await pool.query(`SELECT * FROM users WHERE phone = ?`, [normPhone]);
    user = rows[0];
  }
  if (user.status !== 'active') throw new HttpError(403, 'Account suspended. Contact support.');
  const token = await finalizeLogin(user);
  res.json(token);
}));

// ---- Password login: email primary (phone still accepted) ----
router.post('/password/login', asyncHandler(async (req, res) => {
  const { identifier, phone, email, password } = req.body;
  let user = null;
  const idf = String(identifier || phone || email || '').trim();
  if (!idf || !password) throw new HttpError(400, 'Email and password are both required');

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

// ---- Forgot password: email do -> OTP issue (email-first recovery) ----
router.post('/forgot', asyncHandler(async (req, res) => {
  const idf = String(req.body.identifier || req.body.email || req.body.phone || '').trim();
  if (!idf) throw new HttpError(400, 'Enter your registered email');
  let user = null;
  if (idf.includes('@')) {
    const [rows] = await pool.query(`SELECT * FROM users WHERE email = ?`, [idf.toLowerCase()]);
    user = rows[0];
  } else {
    const [rows] = await pool.query(`SELECT * FROM users WHERE phone = ?`, [normalizePhone(idf)]);
    user = rows[0];
  }
  if (!user) throw new HttpError(404, 'No account found for this email');
  const otpRes = await issueOtp(user.phone);
  res.json({ message: `OTP sent to ${user.email}. Enter the code with your new password.`, phone: user.phone, sent_to: user.email, dev_otp: otpRes.devCode });
}));

// ---- Reset password with OTP (email-first: email ya phone dono accept) ----
router.post('/reset', asyncHandler(async (req, res) => {
  const { email, phone, otp, new_password } = req.body;
  if (!new_password || String(new_password).length < 8) throw new HttpError(400, 'New password min 8 characters');
  let normPhone = phone;
  if (email && !phone) {
    const [rows] = await pool.query(`SELECT phone FROM users WHERE email = ?`, [String(email).trim().toLowerCase()]);
    if (!rows.length) throw new HttpError(404, 'No account found for this email');
    normPhone = rows[0].phone;
  }
  normPhone = normalizePhone(normPhone);
  await verifyOtp(normPhone, otp); // throws on wrong/expired
  await pool.query(`UPDATE users SET password_hash = ? WHERE phone = ?`, [bcrypt.hashSync(String(new_password), 10), normPhone]);
  res.json({ updated: true, message: 'Password reset successful. Sign in with your email and new password.' });
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
    const [p] = await pool.query(`SELECT id, full_name, profile_photo, verification_status, average_rating, completed_jobs FROM service_professionals WHERE user_id = ?`, [user.id]);
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
  // Email ya phone dono accept (frontend identifier 'phone' field mein bhejta hai, email bhi ho sakta hai)
  const idf = String(req.body.phone || req.body.email || '').trim();
  const password = req.body.password;
  const byEmail = idf.includes('@');
  const column = byEmail ? 'email' : 'phone';
  const value = byEmail ? idf.toLowerCase() : normalizePhone(idf);
  const [users] = await pool.query(`SELECT * FROM users WHERE ${column} = ? AND role = 'admin'`, [value]);
  const user = users[0];
  if (!user || !user.password_hash || !bcrypt.compareSync(password || '', user.password_hash)) {
    throw new HttpError(401, 'Invalid admin credentials');
  }
  const token = signToken(user);
  res.json({ token, user: { id: user.id, phone: user.phone, email: user.email, role: 'admin' } });
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
