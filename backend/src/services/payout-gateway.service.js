// Free payment-gateway adapter — payout leg (wallet → JazzCash/Easypaisa).
//
// Design: like the top-up leg, withdrawals are processed through the gateway
// automatically. In dev the adapter simulates the provider's disbursement API
// (same pattern as the simulated hosted checkout); in production you swap the
// `disburse()` implementation for the provider's real payout/disbursement API
// (JazzCash Mobile to Merchant / Easypaisa Disbursement — both have free
// merchant onboarding; per-transaction fees only).
//
// Returns a gateway transaction id so the ledger never needs manual references.
const crypto = require('crypto');

async function disburse({ provider, account_number: accountNumber, amount, reference }) {
  // TODO production: replace with the provider's real disbursement API call
  // (signed server-to-server request). The simulated response mirrors its shape.
  const tid = `${provider === 'easypaisa' ? 'EP' : 'JC'}-${Date.now().toString().slice(-8)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  return {
    success: true,
    gateway_transaction_id: tid,
    provider,
    account_number: accountNumber,
    amount,
    reference,
    processed_at: new Date().toISOString(),
  };
}

module.exports = { disburse };
