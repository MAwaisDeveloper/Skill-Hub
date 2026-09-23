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
    await notifyHelper(p.id, 'contract', `New contract opportunity ${code}: ${workers_needed} worker(s), budget Rs ${budget_min}-${budget_max}`, null);
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

    // Section 11: poora quoted amount award par escrow mein lock hota hai
    // (40% deposit = milestone 1, baqi milestones par customer confirm karte hue release)
    const total = Number(bid.quoted_price);
    const deposit = Math.round(total * 0.4 * 100) / 100;

    // split into milestones (up to 4) — sab 'held' (paisa pehle se locked)
    const milestoneCount = Math.max(2, Math.min(4, contract.duration_days || 2));
    const per = Math.floor((total - deposit) / (milestoneCount - 1) * 100) / 100;
    let acc = 0;
    for (let i = 1; i <= milestoneCount; i++) {
      const amount = i === 1 ? deposit : (i === milestoneCount ? Math.round((total - acc) * 100) / 100 : per);
      await conn.query(
        `INSERT INTO contract_milestones (contract_id, milestone_no, amount, description, status) VALUES (?, ?, ?, ?, ?)`,
        [contractId, i, amount, i === 1 ? '40% deposit (held in escrow)' : `Milestone ${i} payment (held in escrow)`, 'held']
      );
      acc += amount;
    }
    // hold FULL quoted amount in escrow from customer wallet
    await walletService.holdForBooking(conn, customerUserId, null, total);
    // record ledger against contract via note (booking_id null; wallet_tx note references contract code)
    await conn.query(
      `UPDATE wallet_transactions SET note = CONCAT(note, ' - contract ', ?) WHERE wallet_id = (SELECT id FROM wallets WHERE user_id = ?) AND related_booking_id IS NULL AND type = 'hold' ORDER BY id DESC LIMIT 1`,
      [contract.contract_code, customerUserId]
    );

    await conn.query(`UPDATE contract_bids SET status = 'selected' WHERE id = ?`, [bidId]);
    await conn.query(`UPDATE contract_bids SET status = 'rejected' WHERE contract_id = ? AND id != ?`, [contractId, bidId]);
    await conn.query(`UPDATE contracts SET status = 'awarded', awarded_bid_id = ? WHERE id = ?`, [bidId, contractId]);

    const [proUser] = await conn.query(`SELECT u.id AS uid FROM service_professionals sp JOIN users u ON u.id = sp.user_id WHERE sp.id = ?`, [bid.professional_id]);
    await notifyHelper(proUser[0].uid, 'contract', `Your bid for ${contract.contract_code} was selected! Full amount Rs ${total} escrow mein secured.`, null, null, conn);
    return { status: 'awarded', escrow_held: total, deposit_milestone: deposit, milestones: milestoneCount, commission_note: `${settings.commissionPercent}% commission applies on each released milestone` };
  });
}

// Customer milestone confirm kare => escrow se release + 10% commission cut + pro wallet credit
// (Section 11: milestone-based contract payments)
async function releaseMilestone(customerUserId, contractId, milestoneNo) {
  const settings = await getSettings();
  return withTransaction(async (conn) => {
    const [contracts] = await conn.query(`SELECT * FROM contracts WHERE id = ? FOR UPDATE`, [contractId]);
    const contract = contracts[0];
    if (!contract) throw new HttpError(404, 'Contract not found');
    const [cust] = await conn.query(`SELECT u.id AS uid FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = ?`, [contract.customer_id]);
    if (cust[0].uid !== customerUserId) throw new HttpError(403, 'Not your contract');
    if (contract.status !== 'awarded' && contract.status !== 'in_progress') throw new HttpError(400, `Contract is ${contract.status} — milestones release sirf awarded contract par`);

    const [ms] = await conn.query(
      `SELECT * FROM contract_milestones WHERE contract_id = ? AND milestone_no = ? FOR UPDATE`,
      [contractId, milestoneNo]
    );
    const milestone = ms[0];
    if (!milestone) throw new HttpError(404, 'Milestone not found');
    if (milestone.status === 'released') throw new HttpError(400, 'Ye milestone pehle hi release ho chuka hai');
    if (milestone.status === 'disputed') throw new HttpError(400, 'Ye milestone disputed hai — admin resolve karega');

    // sequential enforcement: milestone 2 tab tak nahi jab tak 1 release na ho
    if (milestoneNo > 1) {
      const [prev] = await conn.query(
        `SELECT status FROM contract_milestones WHERE contract_id = ? AND milestone_no = ?`,
        [contractId, milestoneNo - 1]
      );
      if (prev[0] && prev[0].status !== 'released') {
        throw new HttpError(400, `Pehle milestone ${milestoneNo - 1} release karein (order maintain hota hai)`);
      }
    }

    const amount = Number(milestone.amount);
    if (amount <= 0) throw new HttpError(400, 'Milestone amount 0 hai — kuch release nahi hoga');

    const commissionPercent = settings.commissionPercent;
    const commissionAmount = Math.round(amount * (commissionPercent / 100) * 100) / 100;
    const proAmount = amount - commissionAmount;

    // 1) commission record (booking_id null hai contracts ke liye) + platform wallet credit
    await conn.query(`INSERT INTO commissions (booking_id, amount, percentage) VALUES (NULL, ?, ?)`, [commissionAmount, commissionPercent]);
    await walletService.creditPlatformRevenue(conn, commissionAmount, `Contract ${contract.contract_code} milestone ${milestoneNo} commission (${commissionPercent}%)`);

    // 2) escrow unlock from customer wallet (deposit pehle se HELD hai — sirf held_amount kam hota hai)
    const custWallet = await walletService.getWalletForUpdate(conn, customerUserId);
    if (Number(custWallet.held_amount) < amount) {
      throw new HttpError(400, `Escrow held (Rs ${custWallet.held_amount}) is milestone (Rs ${amount}) se kam hai — admin se rabta karein`);
    }
    await conn.query(`UPDATE wallets SET held_amount = GREATEST(0, held_amount - ?) WHERE id = ?`, [amount, custWallet.id]);
    const [proUser] = await conn.query(`SELECT u.id AS uid, sp.full_name FROM service_professionals sp JOIN users u ON u.id = sp.user_id WHERE sp.id = (SELECT professional_id FROM contract_bids WHERE id = ?)`, [contract.awarded_bid_id]);
    await walletService.addLedger(conn, custWallet.id, 'release', amount, null, `Milestone ${milestoneNo}/${milestoneCount(contract)} released to ${proUser[0].full_name} — contract ${contract.contract_code} (commission ${commissionPercent}% deducted)`, custWallet.balance);

    // 3) professional payout (penalty auto-deduct ke sath)
    const proUserId = proUser[0].uid;
    let netPro = proAmount;
    const [penalties] = await conn.query(
      `SELECT * FROM professional_penalties WHERE professional_id = (SELECT professional_id FROM contract_bids WHERE id = ?) AND settled = 0 ORDER BY id ASC FOR UPDATE`,
      [contract.awarded_bid_id]
    );
    const proId = penalties.length ? penalties[0].professional_id : (await conn.query(`SELECT professional_id FROM contract_bids WHERE id = ?`, [contract.awarded_bid_id]))[0][0].professional_id;
    let remaining = proAmount;
    for (const pen of penalties) {
      const due = Number(pen.amount);
      if (remaining <= 0) break;
      const take = Math.min(due, remaining);
      await conn.query(`UPDATE professional_penalties SET amount = amount - ?, settled = ?, settled_at = ? WHERE id = ?`, [
        take, take >= due ? 1 : 0, take >= due ? new Date() : null, pen.id,
      ]);
      remaining -= take;
      netPro -= take;
      await conn.query(
        `INSERT INTO wallet_transactions (wallet_id, type, amount, related_booking_id, note, balance_after)
         SELECT id, 'penalty', ?, NULL, ?, balance FROM wallets WHERE user_id = ?`,
        [take, `Penalty recovered from contract milestone (${pen.reason || 'cancellation penalty'})`, proUserId]
      );
    }

    const proWallet = await walletService.getWalletForUpdate(conn, proUserId);
    await conn.query(`UPDATE wallets SET balance = balance + ? WHERE id = ?`, [netPro, proWallet.id]);
    const [proAfter] = await conn.query(`SELECT balance FROM wallets WHERE id = ?`, [proWallet.id]);
    await walletService.addLedger(conn, proWallet.id, 'payout', netPro, null, `Contract ${contract.contract_code} milestone ${milestoneNo} payout (Rs ${amount} - ${commissionPercent}% commission - penalties)`, proAfter[0].balance);

    await conn.query(`INSERT INTO payouts (professional_id, booking_id, amount, status, released_at) VALUES (?, NULL, ?, 'released', NOW())`, [proId, netPro]);

    // 4) milestone + contract status update
    await conn.query(`UPDATE contract_milestones SET status = 'released', released_at = NOW() WHERE id = ?`, [milestone.id]);
    await conn.query(`UPDATE contracts SET status = 'in_progress' WHERE id = ? AND status = 'awarded'`, [contractId]);
    const [left] = await conn.query(
      `SELECT COUNT(*) AS c FROM contract_milestones WHERE contract_id = ? AND status IN ('pending','held','disputed')`,
      [contractId]
    );
    if (left[0].c === 0) {
      await conn.query(`UPDATE contracts SET status = 'completed' WHERE id = ?`, [contractId]);
    }

    // 5) notifications
    const notify = require('../utils/helpers').notify;
    await notify(proUserId, 'contract', `Milestone ${milestoneNo} released on ${contract.contract_code}: Rs ${netPro} aap ke wallet mein (commission Rs ${commissionAmount} cut)`, null, null, conn);

    return {
      released: true,
      milestone_no: milestoneNo,
      amount,
      commission: commissionAmount,
      pro_received: netPro,
      contract_status: left[0].c === 0 ? 'completed' : 'in_progress',
      milestones_left: left[0].c,
    };
  });
}

function milestoneCount(contract) {
  return contract.duration_days || 4;
}

module.exports = { createContract, submitBid, listBids, awardContract, releaseMilestone };
