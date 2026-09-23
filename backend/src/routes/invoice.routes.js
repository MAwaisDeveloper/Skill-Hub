const router = require('express').Router();
const { asyncHandler } = require('../middleware/error');
const { authenticate, requireRole } = require('../middleware/auth');
const invoiceService = require('../services/invoice.service');

router.get('/topup/:reference', authenticate, asyncHandler(async (req, res) => {
  res.json(await invoiceService.topupInvoice(req.user.id, req.params.reference));
}));

router.get('/booking/:id', authenticate, asyncHandler(async (req, res) => {
  res.json(await invoiceService.bookingInvoice(req.user.id, req.user.role, Number(req.params.id)));
}));

router.get('/payout/:id', authenticate, requireRole('professional', 'admin'), asyncHandler(async (req, res) => {
  res.json(await invoiceService.payoutInvoice(req.user.id, Number(req.params.id)));
}));

module.exports = router;
