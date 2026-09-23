const router = require('express').Router();
const { pool } = require('../config/db');
const { asyncHandler, HttpError } = require('../middleware/error');
const { authenticate, requireRole } = require('../middleware/auth');

// Table descriptions for all 29 modules (plan Section 12 + support tables)
const MODULES = [
  ['users', 'Sab roles (Customer/Professional/Admin) ka common login/auth record'],
  ['customers', 'Customer profile: name, photo, trust score'],
  ['customer_addresses', 'Customer ke saved addresses (home/office/other + map pin)'],
  ['service_professionals', 'Professional profile: CNIC, verification, payout account, rating'],
  ['categories', 'Service categories (AC, Electrician, Plumber...)'],
  ['professional_categories', 'Professional ↔ category link (many-to-many)'],
  ['service_areas', 'Professional kin areas mein kaam karta hai'],
  ['availability_slots', 'Calendar slots — double-booking prevention isi se'],
  ['bookings', 'Core booking record: price, status, OTP, schedule'],
  ['booking_events', 'Booking timeline/audit trail (har status change)'],
  ['messages', 'In-app chat (contact-info filter flag isi table par)'],
  ['payments', 'Payment records (gateway refs, status)'],
  ['commissions', 'Platform ki 10% commission per released deal'],
  ['payouts', 'Professional ko release hua paisa + withdrawal requests'],
  ['refunds', 'Cancellation/dispute refunds'],
  ['disputes', 'Complaints — admin resolution ke sath'],
  ['reviews', 'Sirf completed bookings par ratings'],
  ['notifications', 'In-app notification log (bell)'],
  ['trust_scores', 'Cancellation/no-show/dispute pattern tracking'],
  ['contracts', 'Bulk/contract hiring requests'],
  ['contract_bids', 'Professionals ke quotes'],
  ['contract_milestones', 'Milestone-based contract payments (40% deposit)'],
  ['verification_logs', 'Manual verification audit trail (kis admin ne, kab, decision)'],
  ['wallets', 'Live wallet balance + held (escrow) amount'],
  ['wallet_transactions', 'Poora paisa ledger — kis ke naam se aya/gaya'],
  ['wallet_topups', 'JazzCash/Easypaisa top-up records'],
  ['professional_penalties', 'Pro-cancel penalty — agli payout se auto-deduct'],
  ['otp_logins', 'OTP codes + expiry (dev mode: console)'],
  ['platform_settings', 'Admin-configurable rules (commission %, auto-release, etc)'],
];

// Admin: all modules with live row counts
router.get('/admin', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const out = [];
  for (const [table, desc] of MODULES) {
    try {
      const [rows] = await pool.query(`SELECT COUNT(*) AS c FROM \`${table}\``);
      out.push({ table, description: desc, rows: rows[0].c, status: 'ok' });
    } catch {
      out.push({ table, description: desc, rows: null, status: 'missing' });
    }
  }
  res.json(out);
}));

// Customer: apne modules with their own live data
router.get('/customer', authenticate, requireRole('customer'), asyncHandler(async (req, res) => {
  const uid = req.user.id;
  const count = async (sql, params) => (await pool.query(sql, params || [uid]))[0][0].c;

  const [custRows] = await pool.query(`SELECT id FROM customers WHERE user_id = ?`, [uid]);
  const custId = custRows.length ? custRows[0].id : null;
  if (!custId) throw new HttpError(400, 'Customer profile missing');

  res.json([
    { table: 'users', description: 'Aap ka login record (OTP auth)', rows: 1, mine: true },
    { table: 'customers', description: 'Aap ki profile (name, trust score)', rows: 1, mine: true },
    { table: 'customer_addresses', description: 'Aap ke saved addresses', rows: await count(`SELECT COUNT(*) c FROM customer_addresses WHERE customer_id = ?`, [custId]), mine: true },
    { table: 'bookings', description: 'Aap ki bookings (lifecycle ke sath)', rows: await count(`SELECT COUNT(*) c FROM bookings WHERE customer_id = ?`, [custId]), mine: true },
    { table: 'booking_events', description: 'Aap ki bookings ka timeline', rows: await count(`SELECT COUNT(*) c FROM booking_events be JOIN bookings b ON b.id = be.booking_id WHERE b.customer_id = ?`, [custId]) },
    { table: 'messages', description: 'Aap ki bookings ki chat', rows: await count(`SELECT COUNT(*) c FROM messages m JOIN bookings b ON b.id = m.booking_id WHERE b.customer_id = ?`, [custId]) },
    { table: 'payments', description: 'Aap ke payments (top-ups)', rows: await count(`SELECT COUNT(*) c FROM payments WHERE user_id = ?`) },
    { table: 'commissions', description: 'Aap ki deals par platform commission (10%)', rows: await count(`SELECT COUNT(*) c FROM commissions cm JOIN bookings b ON b.id = cm.booking_id WHERE b.customer_id = ?`, [custId]) },
    { table: 'refunds', description: 'Aap ko mile refunds', rows: await count(`SELECT COUNT(*) c FROM refunds r JOIN bookings b ON b.id = r.booking_id WHERE b.customer_id = ?`, [custId]) },
    { table: 'disputes', description: 'Aap ke disputes', rows: await count(`SELECT COUNT(*) c FROM disputes d JOIN bookings b ON b.id = d.booking_id WHERE b.customer_id = ?`, [custId]) },
    { table: 'reviews', description: 'Aap ki reviews', rows: await count(`SELECT COUNT(*) c FROM reviews WHERE customer_id = ?`, [custId]) },
    { table: 'notifications', description: 'Aap ki notifications', rows: await count(`SELECT COUNT(*) c FROM notifications WHERE user_id = ?`) },
    { table: 'trust_scores', description: 'Aap ka trust score record', rows: await count(`SELECT COUNT(*) c FROM trust_scores WHERE user_id = ?`) },
    { table: 'contracts', description: 'Aap ke bulk/contract posts', rows: await count(`SELECT COUNT(*) c FROM contracts WHERE customer_id = ?`, [custId]) },
    { table: 'wallets', description: 'Aap ka wallet (balance + escrow)', rows: 1, mine: true },
    { table: 'wallet_transactions', description: 'Aap ke wallet ki har entry — kis ke naam se aya/gaya', rows: await count(`SELECT COUNT(*) c FROM wallet_transactions t JOIN wallets w ON w.id = t.wallet_id WHERE w.user_id = ?`) },
    { table: 'wallet_topups', description: 'Aap ke JazzCash/Easypaisa top-ups', rows: await count(`SELECT COUNT(*) c FROM wallet_topups WHERE user_id = ?`) },
  ]);
}));

// Professional: apne modules
router.get('/professional', authenticate, requireRole('professional'), asyncHandler(async (req, res) => {
  const uid = req.user.id;
  const [proRows] = await pool.query(`SELECT id FROM service_professionals WHERE user_id = ?`, [uid]);
  if (!proRows.length) throw new HttpError(400, 'Complete your professional profile first');
  const proId = proRows[0].id;
  const count = async (sql, params) => (await pool.query(sql, params || [proId]))[0][0].c;

  res.json([
    { table: 'service_professionals', description: 'Aap ki profile (CNIC, verification, rating, payout)', rows: 1, mine: true },
    { table: 'professional_categories', description: 'Aap ki service categories', rows: await count(`SELECT COUNT(*) c FROM professional_categories WHERE professional_id = ?`) },
    { table: 'service_areas', description: 'Aap ke service areas', rows: await count(`SELECT COUNT(*) c FROM service_areas WHERE professional_id = ?`) },
    { table: 'availability_slots', description: 'Aap ke calendar slots (booked/available)', rows: await count(`SELECT COUNT(*) c FROM availability_slots WHERE professional_id = ?`) },
    { table: 'bookings', description: 'Aap ko mile jobs (lifecycle ke sath)', rows: await count(`SELECT COUNT(*) c FROM bookings WHERE professional_id = ?`), mine: true },
    { table: 'booking_events', description: 'Aap ki jobs ka timeline', rows: await count(`SELECT COUNT(*) c FROM booking_events be JOIN bookings b ON b.id = be.booking_id WHERE b.professional_id = ?`) },
    { table: 'commissions', description: 'Platform commission on your released deals (10%)', rows: await count(`SELECT COUNT(*) c FROM commissions cm JOIN bookings b ON b.id = cm.booking_id WHERE b.professional_id = ?`) },
    { table: 'payouts', description: 'Aap ke payouts + withdrawal requests', rows: await count(`SELECT COUNT(*) c FROM payouts WHERE professional_id = ?`) },
    { table: 'professional_penalties', description: 'Aap ki penalties (unsettled agle payout se katengi)', rows: await count(`SELECT COUNT(*) c FROM professional_penalties WHERE professional_id = ?`) },
    { table: 'verification_logs', description: 'Aap ki verification history (audit trail)', rows: await count(`SELECT COUNT(*) c FROM verification_logs WHERE professional_id = ?`) },
    { table: 'reviews', description: 'Customers ki aap ko di ratings', rows: await count(`SELECT COUNT(*) c FROM reviews WHERE professional_id = ?`) },
    { table: 'contract_bids', description: 'Aap ki contract bids', rows: await count(`SELECT COUNT(*) c FROM contract_bids WHERE professional_id = ?`) },
    { table: 'notifications', description: 'Aap ki notifications', rows: await count(`SELECT COUNT(*) c FROM notifications WHERE user_id = ?`, [uid]) },
    { table: 'trust_scores', description: 'Aap ka trust score record', rows: await count(`SELECT COUNT(*) c FROM trust_scores WHERE user_id = ?`, [uid]) },
    { table: 'wallets', description: 'Aap ka wallet (balance)', rows: 1, mine: true },
    { table: 'wallet_transactions', description: 'Aap ke wallet ki har entry — kis customer ke booking se aya', rows: await count(`SELECT COUNT(*) c FROM wallet_transactions t JOIN wallets w ON w.id = t.wallet_id WHERE w.user_id = ?`, [uid]) },
  ]);
}));

// ---- Data viewer: kisi bhi (apni) table ka live data ----
// Admin: any table. Customer/Professional: only their own rows.
const DATA_TABLES = {
  categories: { admin: true, pro: true, customer: true },
  service_professionals: { admin: true, pro: 'own' },
  customers: { admin: true, customer: 'own' },
  customer_addresses: { admin: true, customer: 'own' },
  bookings: { admin: true, pro: 'own', customer: 'own' },
  booking_events: { admin: true, pro: 'own', customer: 'own' },
  messages: { admin: true, pro: 'own', customer: 'own' },
  commissions: { admin: true, pro: 'own', customer: 'own' },
  payouts: { admin: true, pro: 'own', customer: 'own' },
  refunds: { admin: true, pro: 'own', customer: 'own' },
  disputes: { admin: true, pro: 'own', customer: 'own' },
  reviews: { admin: true, pro: 'own', customer: 'own' },
  notifications: { admin: true, pro: 'own', customer: 'own' },
  trust_scores: { admin: true, pro: 'own', customer: 'own' },
  contracts: { admin: true, pro: 'open', customer: 'own' },
  contract_bids: { admin: true, pro: 'own', customer: 'own' },
  contract_milestones: { admin: true, pro: 'own', customer: 'own' },
  verification_logs: { admin: true, pro: 'own' },
  wallets: { admin: true, pro: 'own', customer: 'own' },
  wallet_transactions: { admin: true, pro: 'own', customer: 'own' },
  wallet_topups: { admin: true, pro: 'own', customer: 'own' },
  withdrawals: { admin: true, pro: 'own', customer: 'own' },
  availability_slots: { admin: true, pro: 'own' },
  professional_categories: { admin: true, pro: 'own' },
  service_areas: { admin: true, pro: 'own' },
  professional_penalties: { admin: true, pro: 'own' },
  platform_settings: { admin: true, pro: true, customer: true },
  users: { admin: true },
  payments: { admin: true, pro: 'own', customer: 'own' },
  otp_logins: { admin: true },
};

// ---- Edit / Delete (har module): user apne rows, admin sab (whitelisted tables only) ----
const WRITE_TABLES = {
  users: { cols: ['email', 'preferred_language', 'status'], self: true, userDelete: false },
  customers: { cols: ['full_name', 'photo_url'], via: 'user_id', userDelete: false },
  customer_addresses: { cols: ['label', 'area', 'full_address', 'latitude', 'longitude'], via: 'customer_id', userDelete: true },
  service_professionals: { cols: ['bio', 'experience_years', 'payout_account', 'payout_provider', 'available_now', 'profile_photo'], via: 'user_id', userDelete: false },
  availability_slots: { cols: ['slot_date', 'start_time', 'end_time', 'is_booked'], via: 'professional_id', userDelete: true },
  service_areas: { cols: ['area_name'], via: 'professional_id', userDelete: true },
  reviews: { cols: ['rating', 'comment'], roleCol: { customer: 'customer_id', professional: 'professional_id' }, userDelete: true },
  notifications: { cols: ['is_read'], via: 'user_id', userDelete: true },
  contracts: { cols: ['status', 'description', 'workers_needed', 'duration_days', 'budget_min', 'budget_max', 'start_date'], roleCol: { customer: 'customer_id' }, userDelete: true },
  contract_bids: { cols: ['status', 'quoted_price', 'quoted_timeline', 'note'], roleCol: { professional: 'professional_id' }, userDelete: true },
  // admin-only tables (financial/audit — users ke liye read-only)
  bookings: { cols: ['status', 'scheduled_date', 'scheduled_slot', 'final_price', 'description', 'offered_price', 'offer_status', 'arrival_minutes', 'late_notified', 'late_approved'], adminOnly: true },
  messages: { cols: ['flagged', 'flag_reason'], adminOnly: true },
  payments: { cols: ['status'], adminOnly: true },
  commissions: { cols: ['amount', 'percentage'], adminOnly: true },
  payouts: { cols: ['status', 'amount'], adminOnly: true },
  refunds: { cols: ['status', 'reason', 'amount'], adminOnly: true },
  disputes: { cols: ['status', 'resolution'], adminOnly: true },
  contract_milestones: { cols: ['status', 'description', 'amount'], adminOnly: true },
  professional_penalties: { cols: ['settled', 'amount', 'reason'], adminOnly: true },
  wallets: { cols: ['balance', 'held_amount'], adminOnly: true },
  wallet_transactions: { cols: ['note'], adminOnly: true },
  wallet_topups: { cols: ['status', 'amount'], adminOnly: true },
  withdrawals: { cols: ['status', 'amount'], adminOnly: true },
  verification_logs: { cols: ['decision', 'note'], adminOnly: true },
  booking_events: { cols: ['note'], adminOnly: true },
  trust_scores: { cols: ['score'], adminOnly: true },
  categories: { cols: ['name', 'description', 'icon'], adminOnly: true },
  platform_settings: { cols: ['setting_value'], adminOnly: true },
  otp_logins: { cols: [], adminOnly: true },
  professional_categories: { cols: [], via: 'professional_id', userDelete: true },
};

async function writeScope(req, table) {
  const cfg = WRITE_TABLES[table];
  if (!cfg) throw new HttpError(403, `Is table par edit/delete allowed nahi hai`);
  const role = req.user.role;
  if (role === 'admin') return { admin: true };
  const [cust] = await pool.query(`SELECT id FROM customers WHERE user_id = ?`, [req.user.id]);
  const [pro] = await pool.query(`SELECT id FROM service_professionals WHERE user_id = ?`, [req.user.id]);
  const custId = cust[0]?.id, proId = pro[0]?.id;
  if (cfg.self) return { where: 'id', val: req.user.id };
  if (cfg.roleCol && cfg.roleCol[role]) return { where: cfg.roleCol[role], val: role === 'professional' ? proId : custId };
  if (cfg.via === 'user_id') return { where: 'user_id', val: req.user.id };
  if (cfg.via === 'customer_id') { if (!custId) throw new HttpError(403, 'Customer profile missing'); return { where: 'customer_id', val: custId }; }
  if (cfg.via === 'professional_id') { if (!proId) throw new HttpError(403, 'Professional profile missing'); return { where: 'professional_id', val: proId }; }
  throw new HttpError(403, 'Is table par aap ka edit/delete access nahi hai');
}

function pickCols(cfg, body) {
  const vals = {};
  for (const c of cfg.cols) if (body[c] !== undefined) vals[c] = body[c];
  if (!Object.keys(vals).length) throw new HttpError(400, 'Koi valid field nahi mila (allowed: ' + cfg.cols.join(', ') + ')');
  return vals;
}

router.put('/data/:table/:id', authenticate, asyncHandler(async (req, res) => {
  const { table, id } = req.params;
  const cfg = WRITE_TABLES[table];
  if (!cfg) throw new HttpError(403, `Is table par edit allowed nahi hai`);
  const scope = await writeScope(req, table);
  const vals = pickCols(cfg, req.body);
  if (!scope.admin && cfg.adminOnly) throw new HttpError(403, 'Ye table sirf admin edit kar sakta hai');
  const sets = Object.keys(vals).map((c) => `\`${c}\` = ?`).join(', ');
  const params = [...Object.values(vals)];
  let whereSql = '`id` = ?'; params.push(Number(id));
  if (!scope.admin) { whereSql += ` AND \`${scope.where}\` = ?`; params.push(scope.val); }
  const [r] = await pool.query(`UPDATE \`${table}\` SET ${sets} WHERE ${whereSql}`, params);
  if (!r.affectedRows) throw new HttpError(404, 'Row nahi mili ya aap ka access nahi hai');
  const [row] = await pool.query(`SELECT * FROM \`${table}\` WHERE id = ?`, [Number(id)]);
  res.json({ updated: true, row: row[0] });
}));

router.delete('/data/:table/:id', authenticate, asyncHandler(async (req, res) => {
  const { table, id } = req.params;
  const cfg = WRITE_TABLES[table];
  if (!cfg) throw new HttpError(403, `Is table par delete allowed nahi hai`);
  const scope = await writeScope(req, table);
  if (!scope.admin && !cfg.userDelete) throw new HttpError(403, 'Ye record delete nahi ho sakta (sirf admin ke paas ye right hai)');
  const params = [Number(id)];
  let whereSql = '`id` = ?';
  if (!scope.admin) { whereSql += ` AND \`${scope.where}\` = ?`; params.push(scope.val); }
  const [r] = await pool.query(`DELETE FROM \`${table}\` WHERE ${whereSql}`, params);
  if (!r.affectedRows) throw new HttpError(404, 'Row nahi mili ya aap ka access nahi hai');
  res.json({ deleted: true });
}));

router.get('/data/:table', authenticate, asyncHandler(async (req, res) => {
  const { table } = req.params;
  const cfg = DATA_TABLES[table];
  if (!cfg) throw new HttpError(404, `Table '${table}' not exposed`);
  const role = req.user.role;
  if (role === 'admin') {
    const [rows] = await pool.query(`SELECT * FROM \`${table}\` ORDER BY 1 DESC LIMIT 200`);
    return res.json({ table, scope: 'all', rows });
  }
  const access = cfg[role];
  if (!access) throw new HttpError(403, `Is table ka access aap ke role ke liye allowed nahi`);

  if (access === true) {
    const [rows] = await pool.query(`SELECT * FROM \`${table}\` ORDER BY 1 DESC LIMIT 200`);
    return res.json({ table, scope: 'all', rows });
  }

  // own-scope: find my id + map table column
  const [cust] = await pool.query(`SELECT id FROM customers WHERE user_id = ?`, [req.user.id]);
  const [pro] = await pool.query(`SELECT id FROM service_professionals WHERE user_id = ?`, [req.user.id]);
  const custId = cust[0]?.id, proId = pro[0]?.id;

  const columnMap = {
    service_professionals: ['id', proId],
    customers: ['id', custId],
    customer_addresses: ['customer_id', custId],
    professional_categories: ['professional_id', proId],
    service_areas: ['professional_id', proId],
    availability_slots: ['professional_id', proId],
    bookings: [role === 'professional' ? 'professional_id' : 'customer_id', role === 'professional' ? proId : custId],
    professional_penalties: ['professional_id', proId],
    verification_logs: ['professional_id', proId],
    contract_bids: ['professional_id', proId],
    reviews: [role === 'professional' ? 'professional_id' : 'customer_id', role === 'professional' ? proId : custId],
    contracts: [role === 'professional' ? null : 'customer_id', role === 'professional' ? null : custId],
  };
  let where = null; let val = null;
  if (columnMap[table]) {
    [where, val] = columnMap[table];
    if (where == null) return res.json({ table, scope: 'own', rows: [] });
  } else if (['wallets', 'wallet_transactions', 'wallet_topups', 'withdrawals', 'notifications', 'trust_scores', 'payments', 'users'].includes(table)) {
    if (table === 'users') return res.json({ table, scope: 'own', rows: (await pool.query(`SELECT id, phone, email, role, status, preferred_language, created_at FROM users WHERE id = ?`, [req.user.id]))[0] });
    if (table === 'wallets') {
      const [rows] = await pool.query(`SELECT * FROM wallets WHERE user_id = ?`, [req.user.id]);
      return res.json({ table, scope: 'own', rows });
    }
    if (table === 'wallet_transactions') {
      const [rows] = await pool.query(
        `SELECT t.* FROM wallet_transactions t JOIN wallets w ON w.id = t.wallet_id WHERE w.user_id = ? ORDER BY t.id DESC LIMIT 200`, [req.user.id]);
      return res.json({ table, scope: 'own', rows });
    }
    if (table === 'wallet_topups' || table === 'withdrawals' || table === 'notifications' || table === 'trust_scores' || table === 'payments') {
      where = 'user_id'; val = req.user.id;
    }
  }
  if (table === 'booking_events') {
    const [rows] = await pool.query(
      `SELECT be.* FROM booking_events be JOIN bookings b ON b.id = be.booking_id WHERE b.${role === 'professional' ? 'professional_id' : 'customer_id'} = ? ORDER BY be.id DESC LIMIT 200`,
      [role === 'professional' ? proId : custId]);
    return res.json({ table, scope: 'own', rows });
  }
  if (table === 'messages') {
    const [rows] = await pool.query(
      `SELECT m.* FROM messages m JOIN bookings b ON b.id = m.booking_id WHERE b.${role === 'professional' ? 'professional_id' : 'customer_id'} = ? ORDER BY m.id DESC LIMIT 200`,
      [role === 'professional' ? proId : custId]);
    return res.json({ table, scope: 'own', rows });
  }
  if (table === 'commissions') {
    const [rows] = await pool.query(
      `SELECT cm.* FROM commissions cm JOIN bookings b ON b.id = cm.booking_id WHERE b.${role === 'professional' ? 'professional_id' : 'customer_id'} = ? ORDER BY cm.id DESC LIMIT 200`,
      [role === 'professional' ? proId : custId]);
    return res.json({ table, scope: 'own', rows });
  }
  if (table === 'payouts') {
    if (role === 'professional') {
      const [rows] = await pool.query(`SELECT * FROM payouts WHERE professional_id = ? ORDER BY id DESC LIMIT 200`, [proId]);
      return res.json({ table, scope: 'own', rows });
    }
    const [rows] = await pool.query(
      `SELECT p.* FROM payouts p JOIN bookings b ON b.id = p.booking_id WHERE b.customer_id = ? ORDER BY p.id DESC LIMIT 200`, [custId]);
    return res.json({ table, scope: 'own', rows });
  }
  if (table === 'refunds' || table === 'disputes') {
    const [rows] = await pool.query(
      `SELECT r.* FROM \`${table}\` r JOIN bookings b ON b.id = r.booking_id WHERE b.${role === 'professional' ? 'professional_id' : 'customer_id'} = ? ORDER BY r.id DESC LIMIT 200`,
      [role === 'professional' ? proId : custId]);
    return res.json({ table, scope: 'own', rows });
  }
  if (table === 'contract_milestones') {
    const [rows] = await pool.query(
      `SELECT cm.* FROM contract_milestones cm JOIN contracts ct ON ct.id = cm.contract_id WHERE ct.customer_id = ? ORDER BY cm.id DESC LIMIT 200`, [custId]);
    return res.json({ table, scope: 'own', rows });
  }

  if (!where) throw new HttpError(403, 'Access configuration error');
  const [rows] = await pool.query(`SELECT * FROM \`${table}\` WHERE \`${where}\` = ? ORDER BY 1 DESC LIMIT 200`, [val]);
  res.json({ table, scope: 'own', rows });
}));

module.exports = router;
