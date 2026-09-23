const nodeCron = require('node-cron');
const bookingService = require('../services/booking.service');

function startJobs() {
  // Auto-release timer (Section 8.4): every 5 minutes, release work_completed
  // bookings whose 24h countdown expired with no customer action.
  nodeCron.schedule('*/5 * * * *', async () => {
    try {
      const released = await bookingService.runAutoRelease();
      if (released > 0) console.log(`[cron] Auto-released ${released} booking(s)`);
    } catch (err) {
      console.error('[cron] auto-release failed:', err.message);
    }
  });
  console.log('[cron] Auto-release job scheduled (every 5 min)');
}

module.exports = { startJobs };
