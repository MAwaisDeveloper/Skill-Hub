// Account-title lookup service.
// Production: JazzCash/Easypaisa "name inquiry" APIs exist for registered
// merchants; on free tier without merchant keys we resolve from our own DB
// (verified payout accounts & users) and return 'Not Found' otherwise —
// exactly the behaviour requested: number ka owner naam ya "Not Found".

const { pool } = require('../config/db');

async function lookupAccountTitle(provider, mobileNumber) {
  const num = String(mobileNumber || '').replace(/[\s-]/g, '');
  if (!/^03\d{9}$/.test(num)) return { found: false, account_title: null, source: null };

  // 1) Registered users with this phone (any role)
  const [users] = await pool.query(
    `SELECT u.phone,
            COALESCE(sp.full_name, c.full_name) AS title,
            CASE WHEN sp.id IS NOT NULL THEN 'Service Professional' WHEN c.id IS NOT NULL THEN 'Customer' ELSE u.role END AS role
     FROM users u
     LEFT JOIN service_professionals sp ON sp.user_id = u.id
     LEFT JOIN customers c ON c.user_id = u.id
     WHERE u.phone = ? AND u.status = 'active'
     LIMIT 1`,
    [num]
  );
  if (users.length && users[0].title) {
    return { found: true, account_title: users[0].title, source: `Hunar ${users[0].role} account` };
  }

  // 2) Professionals using this number as payout account (CNIC-verified payout)
  const [pros] = await pool.query(
    `SELECT full_name, verification_status FROM service_professionals WHERE payout_account = ? LIMIT 1`,
    [num]
  );
  if (pros.length) {
    return { found: true, account_title: pros[0].full_name, source: pros[0].verification_status === 'verified' ? 'Verified payout account' : 'Payout account (unverified)' };
  }

  // 3) Previously used top-up numbers map to the wallet owner
  const [topups] = await pool.query(
    `SELECT COALESCE(c.full_name, sp.full_name) AS title
     FROM wallet_topups t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN customers c ON c.user_id = u.id
     LEFT JOIN service_professionals sp ON sp.user_id = u.id
     WHERE t.mobile_number = ? AND t.status = 'success'
     LIMIT 1`,
    [num]
  );
  if (topups.length && topups[0].title) {
    return { found: true, account_title: topups[0].title, source: 'Previous top-ups on Hunar' };
  }

  return { found: false, account_title: null, source: null };
}

module.exports = { lookupAccountTitle };
