const { body, validationResult } = require('express-validator');

// Usage: router.post('/x', validate([phoneRule]), handler)
function validate(rules = []) {
  return [
    ...rules,
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, details: errors.array() });
      }
      next();
    },
  ];
}

const phoneRule = body('phone')
  .matches(/^03\d{9}$/)
  .withMessage('Phone must be a valid Pakistani mobile number (03XXXXXXXXX)');

const cnicRule = body('cnic_number')
  .matches(/^\d{13}$/)
  .withMessage('CNIC must be exactly 13 digits');

module.exports = { validate, phoneRule, cnicRule };
