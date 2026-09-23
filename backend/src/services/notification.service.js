const { pool } = require('../config/db');
const { notify } = require('../utils/helpers');

async function list(userId, { unread_only } = {}) {
  let sql = `SELECT * FROM notifications WHERE user_id = ?`;
  if (unread_only) sql += ` AND read_status = 0`;
  sql += ` ORDER BY id DESC LIMIT 100`;
  const [rows] = await pool.query(sql, [userId]);
  return rows;
}

async function unreadCount(userId) {
  const [rows] = await pool.query(`SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_status = 0`, [userId]);
  return rows[0].c;
}

async function markRead(userId, notificationId) {
  await pool.query(`UPDATE notifications SET read_status = 1 WHERE id = ? AND user_id = ?`, [notificationId, userId]);
  return { ok: true };
}

async function markAllRead(userId) {
  await pool.query(`UPDATE notifications SET read_status = 1 WHERE user_id = ?`, [userId]);
  return { ok: true };
}

// helper re-export for other services
async function push(userId, type, message, bookingId = null) {
  return notify(userId, type, message, bookingId);
}

module.exports = { list, unreadCount, markRead, markAllRead, push };
