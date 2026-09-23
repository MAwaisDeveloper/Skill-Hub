const { pool } = require('../config/db');
const { HttpError } = require('../middleware/error');
const walletService = require('./wallet.service');

// Payment gateway integration (JazzCash / Easypaisa) - dev simulation.
// IMPORTANT (Section 8.1 security note): the platform NEVER collects the
// customer's PIN. Customer is redirected to the gateway's own secure page.
// In production: implement gateway's hosted-checkout redirect + server-to-server
// callback verification (HMAC hash). Here we simulate both sides for free dev.

async function initiateTopup(userId, { provider, mobile_number, amount }) {
  const topup = await walletService.createTopup(userId, provider, mobile_number, amount);
  return {
    ...topup,
    message: 'Redirect customer to gateway secure page (simulated). PIN is entered on gateway page, never on Hunar.',
  };
}

// Simulates the gateway's server-to-server callback after PIN confirmation.
async function gatewayCallback({ reference, status }) {
  const success = status === 'success';
  return walletService.completeTopup({ reference, success });
}

// Demo: gateway-hosted checkout page data (what production would hand to the SDK)
async function getTopupStatus(userId, reference) {
  const [rows] = await pool.query(
    `SELECT t.* FROM wallet_topups t WHERE t.gateway_transaction_ref = ? AND t.user_id = ?`,
    [reference, userId]
  );
  if (!rows.length) throw new HttpError(404, 'Top-up not found');
  return rows[0];
}

module.exports = { initiateTopup, gatewayCallback, getTopupStatus };
