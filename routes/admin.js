const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const bookingsController = require('../controllers/bookingsController');

router.get('/kiosks', adminController.getKiosks);
router.get('/sessions', adminController.getSessions);
router.get('/payments', adminController.getPayments);
router.get('/refunds', adminController.getRefunds);
router.get('/analytics/summary', adminController.getAnalytics);
router.get('/alerts', adminController.getAlerts);
router.get('/kiosk/:id/live', adminController.getKioskLiveData);
router.get('/tariff-config', adminController.getTariffConfig);
router.patch('/tariff-config', adminController.updateTariffConfig);

// Admin bookings (no auth — matches existing admin route pattern)
router.get('/bookings', bookingsController.adminGetAllBookings);
router.patch('/bookings/:id/status', bookingsController.adminUpdateStatus);
router.delete('/bookings/:id', bookingsController.adminDeleteBooking);

// Admin support tickets (no auth — matches existing admin route pattern)
router.get('/support-tickets', adminController.getSupportTickets);
router.get('/support-tickets/:id', adminController.getSupportTicketById);
router.patch('/support-tickets/:id/status', adminController.updateSupportTicketStatus);
router.patch('/support-tickets/:id/notes', adminController.updateSupportTicketNotes);

module.exports = router;

