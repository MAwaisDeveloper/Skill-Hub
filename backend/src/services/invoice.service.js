const { pool } = require('../config/db');
const { HttpError } = require('../middleware/error');

// Auto-generated invoice numbers: HUN-T-000123 (topup), HUN-B-000045 (booking), HUN-P-000007 (payout)
function invNumber(prefix, id) {
  return `HUN-${prefix}-${String(id).padStart(6, '0')}`;
}

async function topupInvoice(userId, reference) {
  const [rows] = await pool.query(
    `SELECT t.*, u.phone, COALESCE(c.full_name, sp.full_name) AS account_name
     FROM wallet_topups t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN customers c ON c.user_id = u.id
     LEFT JOIN service_professionals sp ON sp.user_id = u.id
     WHERE t.gateway_transaction_ref = ? AND t.user_id = ?`,
    [reference, userId]
  );
  const t = rows[0];
  if (!t) throw new HttpError(404, 'Top-up not found');
  return {
    invoice_number: invNumber('T', t.id),
    type: 'Wallet Top-Up',
    date: t.completed_at || t.created_at,
    from: `${t.account_name} (${t.mobile_number})`,
    to: 'Hunar Platform',
    method: t.provider === 'jazzcash' ? 'JazzCash' : 'Easypaisa',
    reference: t.gateway_transaction_ref,
    status: t.status,
    items: [{ description: `Wallet top-up via ${t.provider}`, amount: Number(t.amount) }],
    subtotal: Number(t.amount),
    fees: 0,
    total: Number(t.amount),
  };
}

async function bookingInvoice(userId, role, bookingId) {
  const [rows] = await pool.query(
    `SELECT b.*, c.name AS category_name, cu.full_name AS customer_name, cu2.phone AS customer_phone,
            sp.full_name AS professional_name, sp2.phone AS professional_phone, sp2.id AS pro_pk
     FROM bookings b
     JOIN categories c ON c.id = b.category_id
     JOIN customers cu ON cu.id = b.customer_id JOIN users cu2 ON cu2.id = cu.user_id
     JOIN service_professionals sp ON sp.id = b.professional_id JOIN users sp2 ON sp2.id = sp.user_id
     WHERE b.id = ?`,
    [bookingId]
  );
  const b = rows[0];
  if (!b) throw new HttpError(404, 'Booking not found');
  const [cust] = await pool.query(`SELECT user_id FROM customers WHERE id = ?`, [b.customer_id]);
  const [pro] = await pool.query(`SELECT user_id FROM service_professionals WHERE id = ?`, [b.pro_pk || b.professional_id]);
  const isParty = [cust[0]?.user_id, pro[0]?.user_id, null].includes(userId) || role === 'admin';
  if (!isParty) throw new HttpError(403, 'Not your invoice');

  const [commissions] = await pool.query(`SELECT COALESCE(SUM(amount),0) AS c FROM commissions WHERE booking_id = ?`, [bookingId]);
  const [released] = await pool.query(`SELECT COALESCE(SUM(amount),0) AS p FROM payouts WHERE booking_id = ?`, [bookingId]);
  const commission = Number(commissions[0].c);
  const payout = Number(released[0].p);
  const settled = ['completed', 'refunded', 'cancelled'].includes(b.status);

  const items = [
    { description: `${b.category_name} service — ${b.scheduled_date} ${String(b.scheduled_slot).slice(0, 5)}`, amount: Number(b.final_price) },
  ];
  if (commission > 0) items.push({ description: 'Platform commission (10%) — deducted at release', amount: -commission });

  return {
    invoice_number: invNumber('B', b.id),
    type: `Service Booking — ${b.booking_code}`,
    date: b.updated_at || b.created_at,
    from: b.status === 'completed' ? `${b.customer_name} → ${b.professional_name}` : b.customer_name,
    to: b.professional_name,
    method: 'Wallet (escrow)',
    reference: b.booking_code,
    status: b.status,
    items,
    subtotal: Number(b.final_price),
    fees: commission,
    total: settled && payout > 0 ? payout : Number(b.final_price),
    customer: b.customer_name,
    professional: b.professional_name,
    escrow_released: payout > 0 ? payout : null,
  };
}

async function payoutInvoice(userId, payoutId) {
  const [rows] = await pool.query(
    `SELECT p.*, sp.full_name, sp.payout_account, sp.payout_provider, u.phone,
            b.booking_code, c.name AS category_name
     FROM payouts p
     JOIN service_professionals sp ON sp.id = p.professional_id
     JOIN users u ON u.id = sp.user_id
     LEFT JOIN bookings b ON b.id = p.booking_id
     LEFT JOIN categories c ON c.id = b.category_id
     WHERE p.id = ?`,
    [payoutId]
  );
  const p = rows[0];
  if (!p) throw new HttpError(404, 'Payout not found');
  const [own] = await pool.query(`SELECT user_id FROM service_professionals WHERE id = ?`, [p.professional_id]);
  const [roleRows] = await pool.query(`SELECT role FROM users WHERE id = ?`, [userId]);
  if (own[0].user_id !== userId && roleRows[0]?.role !== 'admin') throw new HttpError(403, 'Not your invoice');

  return {
    invoice_number: invNumber('P', p.id),
    type: `Job Payout${p.booking_code ? ` — ${p.booking_code}` : ' (Withdrawal)'}`,
    date: p.released_at || p.created_at,
    from: 'Hunar Platform',
    to: `${p.full_name} (${p.payout_provider || '—'} ${p.payout_account || '—'})`,
    method: p.payout_provider === 'easypaisa' ? 'Easypaisa' : 'JazzCash',
    reference: p.booking_code || `PAYOUT-${p.id}`,
    status: p.status,
    items: [{ description: p.category_name ? `Payout for ${p.category_name} job` : 'Wallet withdrawal', amount: Number(p.amount) }],
    subtotal: Number(p.amount),
    fees: 0,
    total: Number(p.amount),
  };
}

async function withdrawalInvoice(userId, withdrawalId) {
  const [rows] = await pool.query(
    `SELECT w.*, COALESCE(sp.full_name, c.full_name) AS full_name
     FROM withdrawals w
     JOIN users u ON u.id = w.user_id
     LEFT JOIN service_professionals sp ON sp.user_id = w.user_id
     LEFT JOIN customers c ON c.user_id = w.user_id
     WHERE w.id = ?`,
    [withdrawalId]
  );
  const w = rows[0];
  if (!w) throw new HttpError(404, 'Withdrawal not found');
  const [roleRows] = await pool.query(`SELECT role FROM users WHERE id = ?`, [userId]);
  if (w.user_id !== userId && roleRows[0]?.role !== 'admin') throw new HttpError(403, 'Not your invoice');

  return {
    invoice_number: invNumber('W', w.id),
    type: 'Wallet Withdrawal',
    date: w.processed_at || w.created_at,
    from: `${w.full_name} (Hunar Wallet)`,
    to: `${w.account_title || w.full_name} (${w.provider === 'easypaisa' ? 'Easypaisa' : 'JazzCash'} ${w.account_number})`,
    method: w.provider === 'easypaisa' ? 'Easypaisa' : 'JazzCash',
    reference: `WDR-${String(w.id).padStart(6, '0')}`,
    status: w.status,
    items: [{ description: `Withdrawal to ${w.provider} account`, amount: Number(w.amount) }],
    subtotal: Number(w.amount),
    fees: 0,
    total: Number(w.amount),
    admin_note: w.admin_note || null,
  };
}

async function penaltyInvoice(userId, penaltyId) {
  const [rows] = await pool.query(
    `SELECT pen.*, sp.full_name, b.booking_code, c.name AS category_name
     FROM professional_penalties pen
     JOIN service_professionals sp ON sp.id = pen.professional_id
     LEFT JOIN bookings b ON b.id = pen.booking_id
     LEFT JOIN categories c ON c.id = b.category_id
     WHERE pen.id = ?`,
    [penaltyId]
  );
  const pen = rows[0];
  if (!pen) throw new HttpError(404, 'Penalty not found');
  const [own] = await pool.query(`SELECT user_id FROM service_professionals WHERE id = ?`, [pen.professional_id]);
  const [roleRows] = await pool.query(`SELECT role FROM users WHERE id = ?`, [userId]);
  if (own[0].user_id !== userId && roleRows[0]?.role !== 'admin') throw new HttpError(403, 'Not your invoice');

  return {
    invoice_number: invNumber('PEN', pen.id),
    type: 'Cancellation Penalty',
    date: pen.created_at,
    from: pen.full_name,
    to: 'Hunar Platform / Customer compensation',
    method: 'Auto-deducted from future payouts',
    reference: pen.booking_code || `PEN-${String(pen.id).padStart(6, '0')}`,
    status: pen.settled ? 'settled' : 'owed',
    items: [{ description: pen.reason || `Penalty — ${pen.category_name || 'job'} cancellation`, amount: Number(pen.amount) }],
    subtotal: Number(pen.amount),
    fees: 0,
    total: Number(pen.amount),
    settled: !!pen.settled,
  };
}

module.exports = { topupInvoice, bookingInvoice, payoutInvoice, withdrawalInvoice, penaltyInvoice, invNumber };
