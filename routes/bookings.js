const express = require('express');
const router = express.Router();
const bookingsController = require('../controllers/bookingsController');
const authMiddleware = require('../middleware/auth');

// Since we don't have a strict admin middleware yet (assumed from server.js routes), 
// we'll just use authMiddleware and the controller handles basic ownership checks.
// If an admin middleware exists, it should be applied to admin routes.
// For now, these are mixed user/admin routes.

// User & Admin: Get all bookings (admin sees all, user sees own)
router.get('/', authMiddleware, bookingsController.getAllBookings);

// User: Create a new booking
router.post('/', authMiddleware, bookingsController.createBooking);

// User/Admin: Cancel a booking
router.delete('/:id', authMiddleware, bookingsController.deleteBooking);

// Admin: Update booking status
router.patch('/:id/status', authMiddleware, bookingsController.updateStatus);

// Public/User: Check availability for a kiosk
router.get('/kiosk/:kioskId', bookingsController.getKioskAvailability);

module.exports = router;
