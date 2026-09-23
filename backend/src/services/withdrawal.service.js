const { pool, withTransaction } = require('../config/db');
const { HttpError } = require('../middleware/error');
const { lookupAccountTitle } = require('./lookup.service');
const walletService = require('./wallet.service');
const { notify } = require('../utils/helpers');

// Request a withdrawal: money leaves wallet immediately (held until admin
// transfers or rejects). Works for both customer and professional.
async function requestWithdrawal(userId, role, { amount, provider, account_number }) {
  if (!(amount >= 500)) throw new HttpError(400, 'Minimum withdrawal Rs 500');
  if (!['jazzcash', 'easypaisa'].includes(provider)) throw new HttpError(400, 'Provider select karein');
  const title = await lookupAccountTitle(provider, account_number);
  if (!title.found) throw new HttpError(400, `Account title Not Found for ${account_number} on ${provider}. Number check karein.`);

  return withTransaction(async (conn) => {
    const [wallets] = await conn.query(`SELECT * FROM wallets WHERE user_id = ? FOR UPDATE`, [userId]);
    if (!wallets.length) throw new HttpError(400, 'Wallet missing');
    const wallet = wallets[0];
    if (Number(wallet.balance) < amount) throw new HttpError(400, `Insufficient balance (available Rs ${wallet.balance})`);

    await conn.query(`UPDATE wallets SET balance = balance - ? WHERE id = ?`, [amount, wallet.id]);
    const [after] = await conn.query(`SELECT balance FROM wallets WHERE id = ?`, [wallet.id]);
    await walletService.addLedger(conn, wallet.id, 'payout', amount, null, `Withdrawal request → ${provider} ${account_number} (${title.account_title}) — pending admin transfer`, after[0].balance);

    const [res] = await conn.query(
      `INSERT INTO withdrawals (user_id, role, provider, account_number, account_title, amount, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [userId, role, provider, account_number, title.account_title, amount]
    );
    return { withdrawal_id: res.insertId, amount, to: `${title.account_title} (${account_number})`, status: 'pending' };
  });
}

async function listMine(userId) {
  const [rows] = await pool.query(`SELECT * FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 100`, [userId]);
  return rows;
}

async function adminList() {
  const [rows] = await pool.query(
    `SELECT w.*, u.phone, u.role FROM withdrawals w JOIN users u ON u.id = w.user_id ORDER BY w.id DESC LIMIT 200`
  );
  return rows;
}

async function adminResolve(id, action, adminNote) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(`SELECT * FROM withdrawals WHERE id = ? FOR UPDATE`, [id]);
    const wd = rows[0];
    if (!wd) throw new HttpError(404, 'Withdrawal not found');
    if (wd.status !== 'pending') throw new HttpError(400, 'Already processed');
    if (action === 'complete') {
      await conn.query(`UPDATE withdrawals SET status = 'completed', processed_at = NOW(), admin_note = ? WHERE id = ?`, [adminNote || null, id]);
      await notify(wd.user_id, 'payout', `Withdrawal Rs ${wd.amount} completed → ${wd.account_title} (${wd.provider} ${wd.account_number})`);
      return { status: 'completed' };
    }
    // reject → refund money back
    const [wallets] = await conn.query(`SELECT * FROM wallets WHERE user_id = ? FOR UPDATE`, [wd.user_id]);
    await conn.query(`UPDATE wallets SET balance = balance + ? WHERE id = ?`, [wd.amount, wallets[0].id]);
    const [after] = await conn.query(`SELECT balance FROM wallets WHERE id = ?`, [wallets[0].id]);
    await walletService.addLedger(conn, wallets[0].id, 'refund', wd.amount, null, `Withdrawal rejected by admin — refund${adminNote ? `: ${adminNote}` : ''}`, after[0].balance);
    await conn.query(`UPDATE withdrawals SET status = 'rejected', processed_at = NOW(), admin_note = ? WHERE id = ?`, [adminNote || null, id]);
    await notify(wd.user_id, 'payout', `Withdrawal Rs ${wd.amount} rejected — Rs ${wd.amount} wapas wallet mein${adminNote ? ` (${adminNote})` : ''}`);
    return { status: 'rejected' };
  });
}

module.exports = { requestWithdrawal, listMine, adminList, adminResolve };
