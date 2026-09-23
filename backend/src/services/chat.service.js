const { pool } = require('../config/db');
const { HttpError } = require('../middleware/error');
const { checkContactInfo } = require('../utils/contactFilter');
const { notify } = require('../utils/helpers');

// In-app chat tied to booking; contact-info filter per Section 9.
async function sendMessage(senderId, bookingId, text) {
  const [bookings] = await pool.query(`SELECT * FROM bookings WHERE id = ?`, [bookingId]);
  const booking = bookings[0];
  if (!booking) throw new HttpError(404, 'Booking not found');

  const [parties] = await pool.query(
    `SELECT u.id FROM bookings b
     JOIN customers c ON c.id = b.customer_id JOIN users u ON u.id = c.user_id WHERE b.id = ?
     UNION
     SELECT u.id FROM bookings b
     JOIN service_professionals sp ON sp.id = b.professional_id JOIN users u ON u.id = sp.user_id WHERE b.id = ?`,
    [bookingId, bookingId]
  );
  if (!parties.some((p) => p.id === senderId)) throw new HttpError(403, 'Not a party to this booking');

  const flags = checkContactInfo(text);
  const flagged = flags.length > 0;

  const [res] = await pool.query(`INSERT INTO messages (booking_id, sender_id, text, flagged, flag_reason) VALUES (?, ?, ?, ?, ?)`, [
    bookingId,
    senderId,
    text,
    flagged ? 1 : 0,
    flagged ? flags.map((f) => f.reason).join(', ') : null,
  ]);

  // notify the other party
  const [other] = await pool.query(
    `SELECT u.id AS uid FROM bookings b
     JOIN customers c ON c.id = b.customer_id JOIN users u ON u.id = c.user_id WHERE b.id = ? AND u.id != ?
     UNION
     SELECT u.id AS uid FROM bookings b
     JOIN service_professionals sp ON sp.id = b.professional_id JOIN users u ON u.id = sp.user_id WHERE b.id = ? AND u.id != ?`,
    [bookingId, senderId, bookingId, senderId]
  );
  if (other.length) await notify(other[0].uid, 'chat', `New message on booking ${booking.booking_code}`, bookingId);

  return {
    message_id: res.insertId,
    flagged,
    warning: flagged ? `Contact/off-platform info detected (${flags.map((f) => f.reason).join(', ')}). Sharing these is against platform rules.` : null,
  };
}

async function getMessages(userId, bookingId) {
  const [rows] = await pool.query(
    `SELECT m.*, u.phone AS sender_phone,
            COALESCE(sp.full_name, c.full_name, u.phone) AS sender_name,
            CASE WHEN sp.id IS NOT NULL THEN 'Service Professional' WHEN c.id IS NOT NULL THEN 'Customer' ELSE u.role END AS sender_role
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     LEFT JOIN service_professionals sp ON sp.user_id = m.sender_id
     LEFT JOIN customers c ON c.user_id = m.sender_id
     WHERE m.booking_id = ? ORDER BY m.created_at ASC`,
    [bookingId]
  );
  return rows;
}

module.exports = { sendMessage, getMessages };
