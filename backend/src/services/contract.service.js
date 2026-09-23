const { pool, withTransaction } = require('../config/db');
const { HttpError } = require('../middleware/error');
const { contractCode, notify: notifyHelper, getSettings } = require('../utils/helpers');
const walletService = require('./wallet.service');

// ---------- Section 11: Bulk / Contract Hiring ----------

async function createContract(customerUserId, payload) {
  const { category_id, workers_needed, duration_days, start_date, budget_min, budget_max, description } = payload;
  if (!(budget_max >= budget_min)) throw new HttpError(400, 'budget_max must be >= budget_min');
  const code = contractCode();
  const [res] = await pool.query(
    `INSERT INTO contracts (contract_code, customer_id, category_id, workers_needed, duration_days, start_date, budget_min, budget_max, description, status)
     VALUES (?, (SELECT id FROM customers WHERE user_id = ?), ?, ?, ?, ?, ?, ?, ?, 'open')`,
    [code, customerUserId, category_id, workers_needed || 1, duration_days || 1, start_date, budget_min, budget_max, description || null]
  );
  const contractId = res.insertId;

  // notify matching verified professionals
  const [pros] = await pool.query(
    `SELECT u.id FROM service_professionals sp JOIN users u ON u.id = sp.user_id
     JOIN professional_categories pc ON pc.professional_id = sp.id
     WHERE sp.verification_status = 'verified' AND pc.category_id = ? AND u.status = 'active'`,
    [category_id]
  );
  for (const p of pros) {
    await notify(p.id, 'contract', `New contract opportunity ${code}: ${workers_needed} worker(s), budget Rs ${budget_min}-${budget_max}`, null);
  }
  return { contract_id: contractId, contract_code: code, notified_professionals: pros.length };
}

async function submitBid(proUserId, contractId, { quoted_price, quoted_timeline, note }) {
  const [contracts] = await pool.query(`SELECT * FROM contracts WHERE id = ? AND status = 'open'`, [contractId]);
  if (!contracts.length) throw new HttpError(404, 'Open contract not found');
  const [res] = await pool.query(
    `INSERT INTO contract_bids (contract_id, professional_id, quoted_price, quoted_timeline, note) VALUES (?, (SELECT id FROM service_professionals WHERE user_id = ?), ?, ?, ?)`,
    [contractId, proUserId, quoted_price, quoted_timeline || null, note || null]
  );
  return { bid_id: res.insertId };
}

async function listBids(customerUserId, contractId) {
  const [rows] = await pool.query(
    `SELECT cb.*, sp.full_name, sp.average_rating, sp.completed_jobs
     FROM contract_bids cb
     JOIN service_professionals sp ON sp.id = cb.professional_id
     JOIN contracts ct ON ct.id = cb.contract_id
     JOIN customers c ON c.id = ct.customer_id JOIN users u ON u.id = c.user_id
     WHERE cb.contract_id = ? AND u.id = ? ORDER BY cb.quoted_price ASC`,
    [contractId, customerUserId]
  );
  return rows;
}

async function awardContract(customerUserId, contractId, bidId) {
  const settings = await getSettings();
  return withTransaction(async (conn) => {
    const [contracts] = await conn.query(`SELECT * FROM contracts WHERE id = ? FOR UPDATE`, [contractId]);
    const contract = contracts[0];
    if (!contract) throw new HttpError(404, 'Contract not found');
    const [cust] = await conn.query(`SELECT u.id AS uid FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = ?`, [contract.customer_id]);
    if (cust[0].uid !== customerUserId) throw new HttpError(403, 'Not your contract');
    if (contract.status !== 'open') throw new HttpError(400, 'Contract already awarded');

    const [bids] = await conn.query(`SELECT * FROM contract_bids WHERE id = ? AND contract_id = ?`, [bidId, contractId]);
    const bid = bids[0];
    if (!bid) throw new HttpError(404, 'Bid not found');

    // deposit: 40% of quoted price must be in wallet (Section 11)
    const total = Number(bid.quoted_price);
    const deposit = Math.round(total * 0.4 * 100) / 100;

    // split into milestones (up to 4)
    const milestoneCount = Math.max(2, Math.min(4, contract.duration_days || 2));
    const per = Math.floor((total - deposit) / (milestoneCount - 1) * 100) / 100;
    let acc = deposit;
    for (let i = 1; i <= milestoneCount; i++) {
      const amount = i === milestoneCount ? Math.round((total - acc) * 100) / 100 : per;
      await conn.query(
        `INSERT INTO contract_milestones (contract_id, milestone_no, amount, description, status) VALUES (?, ?, ?, ?, ?)`,
        [contractId, i, amount, i === 1 ? '40% deposit (held in escrow)' : `Milestone ${i} payment`, i === 1 ? 'held' : 'pending']
      );
      acc += amount;
    }
    // hold deposit in escrow from customer wallet
    await walletService.holdForBooking(conn, customerUserId, null, deposit);
    // record ledger against contract via note (booking_id null; wallet_tx note references contract code)
    await conn.query(
      `UPDATE wallet_transactions SET note = CONCAT(note, ' - contract ', ?) WHERE wallet_id = (SELECT id FROM wallets WHERE user_id = ?) AND related_booking_id IS NULL AND type = 'hold' ORDER BY id DESC LIMIT 1`,
      [contract.contract_code, customerUserId]
    );

    await conn.query(`UPDATE contract_bids SET status = 'selected' WHERE id = ?`, [bidId]);
    await conn.query(`UPDATE contract_bids SET status = 'rejected' WHERE contract_id = ? AND id != ?`, [contractId, bidId]);
    await conn.query(`UPDATE contracts SET status = 'awarded', awarded_bid_id = ? WHERE id = ?`, [bidId, contractId]);

    const [proUser] = await conn.query(`SELECT u.id AS uid FROM service_professionals sp JOIN users u ON u.id = sp.user_id WHERE sp.id = ?`, [bid.professional_id]);
    await notifyHelper(proUser[0].uid, 'contract', `Your bid for ${contract.contract_code} was selected! Deposit Rs ${deposit} secured.`, null, null, conn);
    return { status: 'awarded', deposit_held: deposit, milestones: milestoneCount, commission_note: `${settings.commissionPercent}% commission applies on each released milestone` };
  });
}

module.exports = { createContract, submitBid, listBids, awardContract };
