const { pool, withTransaction } = require('../config/db');
const { issueOtp, verifyOtp } = require('../utils/helpers');

// TOP-UP gateway (simulated JazzCash/Easypaisa mobile account) — OTP/SMS flow:
//   1. gatewayInit        -> wallet_topups row + pending reference
//   2. gatewaySendOtp     -> "SMS" to the mobile-app number (dev: code returned + server log)
//   3. gatewayVerifyOtp   -> OTP check; on success the provider mobile account is
//                            debited (provider_wallets) and a transaction id issued
//   4. gatewayCallback    -> Hunar wallet credit (completeTopup) + ledger snapshot
//
// The withdrawal/payout leg lives in payout-gateway.service.js.
// Production: replace this file with the real gateway SDK (hosted checkout +
// server-to-server callback). The platform itself never sees the OTP.

async function gatewayInit(userId, provider, mobileNumber, amount) {
  const walletService = require('./wallet.service');
  return walletService.createTopup(userId, provider, mobileNumber, amount);
}

// Mobile account se OTP "SMS" jata hai (jaisa JazzCash/Easypaisa app karta hai).
// Mobile account row bhi ensure hoti hai (balance seed se aata hai / admin console credit).
async function gatewaySendOtp({ reference }) {
  const [rows] = await pool.query(`SELECT * FROM wallet_topups WHERE gateway_transaction_ref = ?`, [reference]);
  const topup = rows[0];
  if (!topup) throw Object.assign(new Error('Top-up reference not found'), { status: 404 });
  if (topup.status !== 'pending') throw Object.assign(new Error(`Top-up already ${topup.status}`), { status: 400 });
  const res = await issueOtp(topup.mobile_number, 'topup');
  await pool.query(
    `INSERT INTO provider_wallets (provider, account_number, account_title)
     VALUES (?, ?, NULL)
     ON DUPLICATE KEY UPDATE account_number = VALUES(account_number)`,
    [topup.provider, topup.mobile_number]
  );
  return {
    sent: true,
    sent_to: topup.mobile_number,
    message: `OTP sent to your ${topup.provider === 'easypaisa' ? 'Easypaisa' : 'JazzCash'} mobile account (${topup.mobile_number}). Enter the code to authorize Rs ${Number(topup.amount).toLocaleString()}.`,
    dev_otp: res.devCode,
  };
}

// OTP verify -> provider mobile account se paisa cut -> transaction id issue
async function gatewayVerifyOtp({ reference, otp }) {
  const code = String(otp || '').trim();
  if (!/^\d{4,6}$/.test(code)) throw Object.assign(new Error('Enter the OTP sent to your mobile account'), { status: 400 });
  const [rows] = await pool.query(`SELECT * FROM wallet_topups WHERE gateway_transaction_ref = ?`, [reference]);
  const topup = rows[0];
  if (!topup) throw Object.assign(new Error('Top-up reference not found'), { status: 404 });
  if (topup.status !== 'pending') throw Object.assign(new Error(`Top-up already ${topup.status}`), { status: 400 });

  await verifyOtp(topup.mobile_number, code, 'topup'); // throws on wrong/expired/5 attempts

  const ref = `${topup.provider === 'easypaisa' ? 'EP' : 'JC'}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  // Ensure the mobile account row exists (send-otp creates it); seed simulates the
  // mobile app balance via admin credit. Reject if balance is insufficient.
  const [walletRows] = await pool.query(`SELECT * FROM provider_wallets WHERE provider = ? AND account_number = ?`, [topup.provider, topup.mobile_number]);
  const pw = walletRows[0];
  if (!pw) throw Object.assign(new Error('Mobile account not found. Request a new OTP.'), { status: 400 });
  if (Number(pw.balance) < Number(topup.amount)) {
    throw Object.assign(new Error(`Insufficient ${topup.provider === 'easypaisa' ? 'Easypaisa' : 'JazzCash'} balance (available Rs ${Number(pw.balance).toLocaleString()}). Top up your mobile account first.`), { status: 400 });
  }

  await withTransaction(async (conn) => {
    await conn.query(`UPDATE provider_wallets SET balance = balance - ? WHERE id = ?`, [topup.amount, pw.id]);
    const [after] = await conn.query(`SELECT balance, account_title FROM provider_wallets WHERE id = ?`, [pw.id]);
    await conn.query(
      `INSERT INTO provider_wallet_transactions (provider_wallet_id, direction, amount, reference, balance_after, note)
       VALUES (?, 'debit', ?, ?, ?, ?)`,
      [pw.id, topup.amount, ref, after[0].balance, `Hunar wallet top-up (${reference})`]
    );
    await conn.query(`UPDATE wallet_topups SET pin_code = ?, gateway_transaction_ref = ? WHERE id = ?`, [code, ref, topup.id]);
    topup._provider_title = after[0].account_title;
  });

  const [[updated]] = await pool.query(`SELECT * FROM wallet_topups WHERE id = ?`, [topup.id]);
  return {
    verified: true,
    reference: updated.gateway_transaction_ref,
    amount: updated.amount,
    provider: updated.provider,
    account_number: updated.mobile_number,
    account_title: topup._provider_title || null,
    message: 'OTP verified. Payment authorized — amount deducted from your mobile account.',
  };
}

// Simulates the gateway's server-to-server callback after OTP confirmation.
async function gatewayCallback({ reference, status }) {
  const success = status === 'success';
  return require('./wallet.service').completeTopup({ reference, success });
}

module.exports = { gatewayInit, gatewaySendOtp, gatewayVerifyOtp, gatewayCallback };
