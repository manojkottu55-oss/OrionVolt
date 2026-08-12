const db = require('../db');

exports.createBooking = async (req, res) => {
  try {
    const { kioskId, bookingDate, bookingTime, durationMinutes, vehicleModel } = req.body;
    
    // Get user from auth middleware
    const userId = req.user.userId;
    const userProfile = await db.profiles.findById(userId);
    const { supabase } = require('../config/supabaseClient');

    let kiosk = await db.kiosks.findOne(kioskId);

    if (!kiosk) {
      // Auto-create kiosk using upsert if it doesn't exist
      const { data: newKiosk, error } = await supabase
        .from('kiosks')
        .upsert({
          kiosk_id: kioskId,
          name: req.body.kioskName || `Kiosk ${kioskId}`,
          location: req.body.location || 'Demo Location',
          status: 'online'
        }, { onConflict: 'kiosk_id' })
        .select()
        .single();

      if (error) {
        throw error;
      }
      kiosk = newKiosk;
    }

    const booking = await db.bookings.create({
      userId,
      userName: userProfile ? userProfile.name : 'Unknown User',
      userMobile: userProfile ? userProfile.mobile_number : '',
      kioskId,
      kioskLocation: kiosk.location,
      vehicleModel: vehicleModel || 'Unknown',
      bookingDate,
      bookingTime,
      durationMinutes: parseInt(durationMinutes, 10) || 30,
      status: 'upcoming'
    });

    return res.status(201).json({ success: true, booking });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

exports.getAllBookings = async (req, res) => {
  try {
    const { status, kioskId, date, userId } = req.query;
    
    // If the user is not an admin, they can only see their own bookings
    // For admin, we allow filtering by userId if provided, otherwise all.
    // In this project, admin endpoints might be protected by adminMiddleware. 
    // We'll assume admin if req.user.role === 'admin' or something similar,
    // but the route will use the appropriate middleware.
    const filters = { status, kioskId, date };
    
    // If called from user app, we inject userId
    if (req.user && !req.isAdmin) {
      filters.userId = req.user.userId;
    } else if (userId) {
      filters.userId = userId;
    }

    const bookings = await db.bookings.findAll(filters);
    return res.status(200).json({ success: true, bookings });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['upcoming', 'completed', 'cancelled', 'no_show'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const booking = await db.bookings.updateStatus(id, status);
    return res.status(200).json({ success: true, booking });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

exports.deleteBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await db.bookings.findById(id);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check ownership if not admin
    if (req.user && !req.isAdmin && booking.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Unauthorized to cancel this booking' });
    }

    // Only allow cancelling if upcoming
    if (booking.status !== 'upcoming') {
      return res.status(400).json({ error: 'Can only cancel upcoming bookings' });
    }

    await db.bookings.updateStatus(id, 'cancelled');
    return res.status(200).json({ success: true, message: 'Booking cancelled' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

exports.getKioskAvailability = async (req, res) => {
  try {
    const { kioskId } = req.params;
    const { date } = req.query; // YYYY-MM-DD
    
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    const bookings = await db.bookings.findByKioskAndDate(kioskId, date);
    return res.status(200).json({ success: true, bookings });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// ── Admin-specific handlers (no auth required, matches admin route pattern) ──

exports.adminGetAllBookings = async (req, res) => {
  try {
    const { status, kioskId, date, userId } = req.query;
    const filters = {};
    if (status) filters.status = status;
    if (kioskId) filters.kioskId = kioskId;
    if (date) filters.date = date;
    if (userId) filters.userId = userId;

    const bookings = await db.bookings.findAll(filters);
    return res.status(200).json({ success: true, bookings });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

exports.adminUpdateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['upcoming', 'completed', 'cancelled', 'no_show'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const booking = await db.bookings.updateStatus(id, status);
    return res.status(200).json({ success: true, booking });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

exports.adminDeleteBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await db.bookings.findById(id);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.status !== 'upcoming') {
      return res.status(400).json({ error: 'Can only cancel upcoming bookings' });
    }

    await db.bookings.updateStatus(id, 'cancelled');
    return res.status(200).json({ success: true, message: 'Booking cancelled' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
