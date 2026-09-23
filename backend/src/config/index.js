require('dotenv').config({ override: true });

const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  otpSecret: process.env.OTP_SECRET || 'dev-otp-pepper',
  otpExpiryMinutes: Number(process.env.OTP_EXPIRY_MINUTES || 5),
  commissionPercent: Number(process.env.COMMISSION_PERCENT || 10),
  autoReleaseHours: Number(process.env.AUTO_RELEASE_HOURS || 24),
  minAdvanceBookingHours: Number(process.env.MIN_ADVANCE_BOOKING_HOURS || 2),
  maxAdvanceBookingDays: Number(process.env.MAX_ADVANCE_BOOKING_DAYS || 30),
  customerCancelRefundPercent: Number(process.env.CUSTOMER_CANCEL_REFUND_PERCENT || 85),
  customerCancelProCompensationPercent: Number(process.env.CUSTOMER_CANCEL_PRO_COMPENSATION_PERCENT || 10),
  proCancelPenaltyPercent: Number(process.env.PRO_CANCEL_PENALTY_PERCENT || 10),
};

module.exports = config;
