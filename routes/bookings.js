const express = require('express');
const router = express.Router();
const bookingsController = require('../controllers/bookingsController');
const authMiddleware = require('../middleware/auth');

// ── User routes (auth required) ───────────────────────────────────────────────

// Create a new booking (with server-side overlap check)
router.post('/', authMiddleware, bookingsController.createBooking);

// Confirm payment for a booking → generates + returns access code
router.post('/:id/confirm-payment', authMiddleware, bookingsController.confirmSlotPayment);

// Retrieve access code for a booking
router.get('/:id/access-code', authMiddleware, bookingsController.getAccessCode);

// Start charging from an unlocked booking
router.post('/:id/start-charging', authMiddleware, bookingsController.startChargingFromBooking);

// List bookings (filtered to own bookings for authenticated users)
router.get('/', authMiddleware, bookingsController.getAllBookings);

// Cancel a booking
router.delete('/:id', authMiddleware, bookingsController.deleteBooking);
router.post('/:id/cancel', authMiddleware, bookingsController.cancelBooking);

// Check kiosk availability on a date
router.get('/kiosk/:kioskId', bookingsController.getKioskAvailability);

module.exports = router;
