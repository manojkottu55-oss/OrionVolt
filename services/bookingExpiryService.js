/**
 * bookingExpiryService.js
 * Runs every 5 minutes to mark no-show bookings and expire their access codes.
 */

const db = require('../db');
const logger = require('../utils/logger');

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function runExpiryCheck() {
  try {
    // Find confirmed or pending_payment bookings whose slot window has passed
    const expiredBookings = await db.bookings.findExpiredConfirmed();

    if (expiredBookings.length > 0) {
      const ids = expiredBookings.map(b => b.id);
      await db.bookings.bulkUpdateStatus(ids, 'no_show');
      await db.slotAccessCodes.expireOldCodes(); // expire any remaining unused codes

      logger.info(`[BookingExpiry] Marked ${ids.length} booking(s) as no_show: ${ids.join(', ')}`);
    } else {
      logger.info('[BookingExpiry] No expired bookings found.');
    }
  } catch (err) {
    logger.error('[BookingExpiry] Error during expiry check: ' + err.message);
  }
}

function start() {
  logger.info('[BookingExpiry] Expiry service started (interval: 5 min)');
  // Run once immediately on startup, then every 5 minutes
  runExpiryCheck();
  setInterval(runExpiryCheck, INTERVAL_MS);
}

module.exports = { start };
