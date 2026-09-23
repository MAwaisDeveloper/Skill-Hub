const { pool, withTransaction } = require('../config/db');
const { HttpError } = require('../middleware/error');
const { notify: notifyHelper } = require('../utils/helpers');

// ---------- Professional registration (Section 3) ----------

async function registerProfessional({ user, full_name, cnic_number, experience_years, bio, payout_account, payout_provider, category_ids, areas }) {
  if (!user || user.role !== 'professional') throw new HttpError(403, 'Only professional accounts can complete this profile');

  return withTransaction(async (conn) => {
    const [res] = await conn.query(
      `INSERT INTO service_professionals (user_id, full_name, cnic_number, experience_years, bio, payout_account, payout_provider, verification_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), cnic_number = VALUES(cnic_number), experience_years = VALUES(experience_years),
         bio = VALUES(bio), payout_account = VALUES(payout_account), payout_provider = VALUES(payout_provider), verification_status = 'pending'`,
      [user.id, full_name, cnic_number, experience_years || 0, bio || null, payout_account || null, payout_provider || null]
    );

    let proId = res.insertId;
    if (!proId) {
      const [existing] = await conn.query(`SELECT id FROM service_professionals WHERE user_id = ?`, [user.id]);
      proId = existing[0].id;
    }

    await conn.query(`DELETE FROM professional_categories WHERE professional_id = ?`, [proId]);
    for (const catId of category_ids || []) {
      await conn.query(`INSERT IGNORE INTO professional_categories (professional_id, category_id) VALUES (?, ?)`, [proId, catId]);
    }
    await conn.query(`DELETE FROM service_areas WHERE professional_id = ?`, [proId]);
    for (const area of areas || []) {
      await conn.query(`INSERT IGNORE INTO service_areas (professional_id, city, area) VALUES (?, 'Lahore', ?)`, [proId, area]);
    }
    return { professional_id: proId, verification_status: 'pending' };
  });
}

// Upload documents (photos are base64/file paths stored as strings; in dev these are data refs)
async function uploadDocuments(professionalId, { cnic_front_photo, cnic_back_photo, selfie_photo, profile_photo }) {
  await pool.query(
    `UPDATE service_professionals SET cnic_front_photo = COALESCE(?, cnic_front_photo), cnic_back_photo = COALESCE(?, cnic_back_photo),
       selfie_photo = COALESCE(?, selfie_photo), profile_photo = COALESCE(?, profile_photo) WHERE id = ?`,
    [cnic_front_photo || null, cnic_back_photo || null, selfie_photo || null, profile_photo || null, professionalId]
  );
  return { updated: true };
}

// ---------- Admin verification queue (Section 4.1) ----------

async function getVerificationQueue() {
  const [rows] = await pool.query(
    `SELECT sp.id, sp.full_name, sp.cnic_number, sp.cnic_front_photo, sp.cnic_back_photo, sp.selfie_photo,
            sp.verification_status, sp.verification_note, sp.experience_years, sp.bio, u.phone, u.created_at,
            (SELECT GROUP_CONCAT(c.name) FROM professional_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.professional_id = sp.id) AS categories
     FROM service_professionals sp JOIN users u ON u.id = sp.user_id
     WHERE sp.verification_status IN ('pending','rejected')
     ORDER BY sp.created_at ASC`
  );
  return rows;
}

async function reviewVerification({ professionalId, adminUserId, decision, notes }) {
  if (!['approved', 'rejected'].includes(decision)) throw new HttpError(400, 'decision must be approved or rejected');
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(`SELECT sp.*, u.id AS user_id FROM service_professionals sp JOIN users u ON u.id = sp.user_id WHERE sp.id = ? FOR UPDATE`, [professionalId]);
    if (!rows.length) throw new HttpError(404, 'Professional not found');
    const pro = rows[0];

    // CNIC format check (Section 4.1)
    if (decision === 'approved' && !/^\d{13}$/.test(pro.cnic_number)) {
      throw new HttpError(400, 'Cannot approve: CNIC must be exactly 13 digits');
    }

    const newStatus = decision === 'approved' ? 'verified' : 'rejected';
    await conn.query(`UPDATE service_professionals SET verification_status = ?, verification_note = ? WHERE id = ?`, [newStatus, notes || null, professionalId]);
    await conn.query(`INSERT INTO verification_logs (professional_id, reviewed_by, decision, notes) VALUES (?, ?, ?, ?)`, [professionalId, adminUserId, decision, notes || null]);
    await conn.query(`INSERT INTO trust_scores (user_id, role, score) VALUES (?, 'professional', 100) ON DUPLICATE KEY UPDATE score = score`, [pro.user_id]);

    await notifyHelper(pro.user_id, 'verification', decision === 'approved'
      ? 'Congratulations! Your account is Verified. You can now receive bookings.'
      : `Verification rejected: ${notes || 'documents did not match'}. You may resubmit your documents.`, null, null, conn);

    return { professional_id: professionalId, verification_status: newStatus };
  });
}

async function getVerificationLogs(professionalId) {
  const [rows] = await pool.query(
    `SELECT vl.*, u.phone AS admin_phone FROM verification_logs vl JOIN users u ON u.id = vl.reviewed_by WHERE vl.professional_id = ? ORDER BY vl.reviewed_at DESC`,
    [professionalId]
  );
  return rows;
}

module.exports = { registerProfessional, uploadDocuments, getVerificationQueue, reviewVerification, getVerificationLogs };
