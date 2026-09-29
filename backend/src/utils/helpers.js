const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { pool } = require('../config/db');
const { HttpError } = require('../middleware/error');

function normalizePhone(raw) {
  if (!raw) return '';
  return String(raw).replace(/[\s\-()]/g, '').replace(/^\+92/, '0').replace(/^92/, '0');
}

function isValidPhone(p) {
  return /^03\d{9}$/.test(p);
}

function isValidCnic(c) {
  return /^\d{13}$/.test(String(c || ''));
}

// ---- OTP ----
function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

function hashOtp(phone, code) {
  return crypto.createHmac('sha256', config.otpSecret).update(`${phone}:${code}`).digest('hex');
}

// In dev mode OTP is printed to console (no SMS gateway needed for free tier dev).
async function issueOtp(phone, purpose = 'login') {
  const code = generateOtp();
  const codeHash = hashOtp(phone, code);
  const expiresAt = new Date(Date.now() + config.otpExpiryMinutes * 60 * 1000);
  await pool.query(
    `INSERT INTO otp_logins (phone, code_hash, purpose, expires_at) VALUES (?, ?, ?, ?)`,
    [phone, codeHash, purpose, expiresAt]
  );
  if (config.nodeEnv !== 'production') {
    console.log(`[OTP] ${phone} => ${code} (valid ${config.otpExpiryMinutes} min)`);
  }
  return { sent: true, devCode: config.nodeEnv !== 'production' ? code : undefined };
}

async function verifyOtp(phone, code, purpose = 'login') {
  const [rows] = await pool.query(
    `SELECT * FROM otp_logins WHERE phone = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > NOW() ORDER BY id DESC LIMIT 1`,
    [phone, purpose]
  );
  if (!rows.length) throw new HttpError(400, 'OTP expired or not found. Request a new one.');
  const record = rows[0];
  if (record.attempts >= 5) throw new HttpError(429, 'Too many attempts. Request a new OTP.');
  if (hashOtp(phone, String(code)) !== record.code_hash) {
    await pool.query(`UPDATE otp_logins SET attempts = attempts + 1 WHERE id = ?`, [record.id]);
    throw new HttpError(400, 'Incorrect OTP');
  }
  await pool.query(`UPDATE otp_logins SET consumed_at = NOW() WHERE id = ?`, [record.id]);
  return true;
}

// ---- Codes ----
function bookingCode() {
  return 'HB' + Date.now().toString(36).toUpperCase() + crypto.randomInt(100, 999);
}
function contractCode() {
  return 'HC' + Date.now().toString(36).toUpperCase() + crypto.randomInt(100, 999);
}

// ---- Platform settings (admin-configurable) ----
async function getSettings() {
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM platform_settings');
  const map = {};
  rows.forEach((r) => (map[r.setting_key] = r.setting_value));
  return {
    commissionPercent: Number(map.commission_percent ?? config.commissionPercent),
    autoReleaseHours: Number(map.auto_release_hours ?? config.autoReleaseHours),
    minAdvanceBookingHours: Number(map.min_advance_booking_hours ?? config.minAdvanceBookingHours),
    maxAdvanceBookingDays: Number(map.max_advance_booking_days ?? config.maxAdvanceBookingDays),
    customerCancelRefundPercent: Number(map.customer_cancel_refund_percent ?? config.customerCancelRefundPercent),
    customerCancelProCompensationPercent: Number(map.customer_cancel_pro_compensation_percent ?? config.customerCancelProCompensationPercent),
    proCancelPenaltyPercent: Number(map.pro_cancel_penalty_percent ?? config.proCancelPenaltyPercent),
    maxNoShowsBeforeSuspend: Number(map.max_no_shows_before_suspend ?? 3),
  };
}

// ---- Trust score ----
async function adjustTrustScore(userId, delta) {
  await pool.query(`UPDATE trust_scores SET score = GREATEST(0, LEAST(100, score + ?)) WHERE user_id = ?`, [
    delta,
    userId,
  ]);
}

async function notify(userId, type, message, bookingId = null, title = null, conn = null) {
  const runner = conn || pool;
  await runner.query(
    `INSERT INTO notifications (user_id, type, message, related_booking_id, title) VALUES (?, ?, ?, ?, ?)`,
    [userId, type, message, bookingId, title]
  );
}

// ---- Audit event on booking timeline ----
async function logBookingEvent(conn, bookingId, eventType, actorUserId = null, note = null) {
  await conn.query(`INSERT INTO booking_events (booking_id, event_type, actor_user_id, note) VALUES (?, ?, ?, ?)`, [
    bookingId,
    eventType,
    actorUserId,
    note,
  ]);
}

module.exports = {
  normalizePhone,
  isValidPhone,
  isValidCnic,
  generateOtp,
  issueOtp,
  verifyOtp,
  bookingCode,
  contractCode,
  getSettings,
  adjustTrustScore,
  notify,
  logBookingEvent,
};
