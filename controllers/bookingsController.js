const db = require('../db');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Generate a unique 4-digit access code for a kiosk
// ─────────────────────────────────────────────────────────────────────────────
async function generateAccessCode(kioskId, bookingId, validFrom, validUntil) {
  const MAX_ATTEMPTS = 10;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000)); // 1000–9999
    const exists = await db.slotAccessCodes.codeExistsForKiosk(kioskId, code);
    if (!exists) {
      await db.slotAccessCodes.create({ bookingId, kioskId, accessCode: code, validFrom, validUntil });
      return code;
    }
  }
  throw new Error('Could not generate a unique access code after 10 attempts');
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK 3/4: POST /api/bookings — create booking + overlap check
// ─────────────────────────────────────────────────────────────────────────────
exports.createBooking = async (req, res) => {
  try {
    const {
      kioskId, kioskName,
      vehicleId, vehicleModel,
      chargingMode,
      targetEnergyKwh, estimatedAmount, estimatedSocGain,
      estimatedTimeMinutes, slotDurationMinutes, bookingFee, totalPayable,
      arrivalTime   // ISO string e.g. "2026-09-01T14:00:00+05:30"
    } = req.body;

    const userId = req.user.userId;

    // Validate required fields
    if (!kioskId || !vehicleId || !arrivalTime || !slotDurationMinutes) {
      return res.status(400).json({ error: 'kioskId, vehicleId, arrivalTime, and slotDurationMinutes are required' });
    }

    const arrival = new Date(arrivalTime);
    if (isNaN(arrival.getTime())) {
      return res.status(400).json({ error: 'Invalid arrivalTime format' });
    }

    const slotEnd = new Date(arrival.getTime() + slotDurationMinutes * 60 * 1000);

    // ── Task 4: Hard server-side overlap check ──
    const conflict = await db.bookings.checkOverlap(kioskId, arrival.toISOString(), slotEnd.toISOString());
    if (conflict) {
      // Return raw ISO timestamps — the frontend formats them in IST (browser locale).
      // NEVER format on the server: Node runs in UTC and would show the wrong local time.
      return res.status(409).json({
        error: 'SLOT_CONFLICT',
        conflictStart: conflict.arrival_time,
        conflictEnd:   conflict.slot_end_time,
        message: 'This kiosk is already booked for the selected time window. Please choose a different time or kiosk.'
      });
    }

    // ── Resolve kiosk info ──
    let kiosk = await db.kiosks.findOne(kioskId);
    if (!kiosk) {
      const { supabase } = require('../config/supabaseClient');
      const { data: newKiosk, error } = await supabase
        .from('kiosks')
        .upsert({ kiosk_id: kioskId, name: kioskName || `Kiosk ${kioskId}`, location: 'Demo Location', status: 'online' },
                 { onConflict: 'kiosk_id' })
        .select().single();
      if (error) throw error;
      kiosk = newKiosk;
    }

    const userProfile = await db.profiles.findById(userId);

    // ── Create booking ──
    const booking = await db.bookings.createSlotBooking({
      userId,
      userName:              userProfile ? userProfile.name : 'Unknown User',
      userMobile:            userProfile ? userProfile.mobile_number : '',
      kioskId,
      kioskLocation:         kiosk.location,
      vehicleId,
      vehicleModel:          vehicleModel || 'Unknown',
      chargingMode,
      targetEnergyKwh,
      estimatedAmount,
      estimatedSocGain,
      estimatedTimeMinutes,
      slotDurationMinutes,
      bookingFee,
      totalPayable,
      arrivalTime:           arrival.toISOString(),
      slotEndTime:           slotEnd.toISOString(),
      bookingDate:           arrival.toISOString().split('T')[0],
      bookingTime:           arrival.toTimeString().slice(0, 5)
    });

    return res.status(201).json({ success: true, booking });
  } catch (error) {
    logger.error('createBooking error: ' + error.message);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TASK 5/6: POST /api/bookings/:id/confirm-payment
// Marks booking as 'confirmed' and generates the access code
// ─────────────────────────────────────────────────────────────────────────────
exports.confirmSlotPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const booking = await db.bookings.findById(id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (booking.user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    if (booking.status !== 'pending_payment') {
      return res.status(400).json({ error: `Booking is already in status: ${booking.status}` });
    }

    // ── RACE-WINDOW GUARD: Re-check overlap right before issuing the code. ──
    // This catches the scenario where two users both paid for the same slot
    // simultaneously. The first to reach this point wins; the second is
    // auto-cancelled and told clearly what happened.
    const raceConflict = await db.bookings.checkOverlapForConfirm(
      booking.kiosk_id,
      booking.arrival_time,
      booking.slot_end_time,
      booking.id  // exclude self
    );
    if (raceConflict) {
      // Auto-cancel the losing booking so the slot is fully freed
      await db.bookings.updateStatus(id, 'cancelled');
      logger.warn(`Booking ${id} cancelled — race condition: lost to booking ${raceConflict.id}`);
      return res.status(409).json({
        error: 'RACE_CONFLICT',
        conflictStart: raceConflict.arrival_time,
        conflictEnd:   raceConflict.slot_end_time,
        message:
          'This slot was just confirmed by another user while your payment was processing. ' +
          'Your booking has been cancelled. Please go back and choose a different time or kiosk.',
      });
    }

    // Generate unique 4-digit access code
    const accessCode = await generateAccessCode(
      booking.kiosk_id,
      booking.id,
      booking.arrival_time,
      booking.slot_end_time
    );

    // Confirm booking
    const updated = await db.bookings.confirmWithCode(id, accessCode);

    logger.info(`Booking ${id} confirmed. Access code: ${accessCode} | Kiosk: ${booking.kiosk_id}`);

    return res.status(200).json({
      success: true,
      booking: updated,
      accessCode,
      kioskLocation: booking.kiosk_location,
      arrivalTime:   booking.arrival_time,
      slotEndTime:   booking.slot_end_time
    });
  } catch (error) {
    logger.error('confirmSlotPayment error: ' + error.message);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/bookings — user sees own; admin sees all
// ─────────────────────────────────────────────────────────────────────────────
exports.getAllBookings = async (req, res) => {
  try {
    const { status, kioskId, date, userId } = req.query;
    const filters = { status, kioskId, date };

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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/bookings/:id/access-code — return access code for user's booking
// ─────────────────────────────────────────────────────────────────────────────
exports.getAccessCode = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const booking = await db.bookings.findById(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.user_id !== userId) return res.status(403).json({ error: 'Unauthorized' });

    return res.status(200).json({
      success: true,
      accessCode:   booking.access_code,
      status:       booking.status,
      arrivalTime:  booking.arrival_time,
      slotEndTime:  booking.slot_end_time,
      kioskId:      booking.kiosk_id,
      kioskLocation: booking.kiosk_location
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TASK 8: POST /api/bookings/:id/start-charging
// Starts a charging session from a confirmed booking (payment already done)
// ─────────────────────────────────────────────────────────────────────────────
exports.startChargingFromBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const booking = await db.bookings.findById(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.user_id !== userId) return res.status(403).json({ error: 'Unauthorized' });
    if (booking.status !== 'active_unlocked') {
      return res.status(400).json({ error: `Booking is not unlocked yet (status: ${booking.status})` });
    }

    // Create a signin session pointing to this booking's kiosk (skip payment)
    const { supabase } = require('../config/supabaseClient');
    const sessionId = `BOOKING-${booking.id.replace(/-/g, '').substring(0, 16)}`;

    // Insert directly into signin_sessions with 'charging' status (bypasses payment)
    const { error: sessionErr } = await supabase
      .from('signin_sessions')
      .upsert({
        session_id:      sessionId,
        user_id:         userId,
        kiosk_id:        booking.kiosk_id,
        vehicle_type:    'booked',
        requested_energy: booking.target_energy_kwh,
        estimated_amount: booking.estimated_amount,
        status:          'charging'
      }, { onConflict: 'session_id' });

    if (sessionErr) throw sessionErr;

    // Create charging_session record
    await db.chargingSessions.create({
      sessionId,
      sessionType: 'signin',
      kioskId:     booking.kiosk_id,
      startTime:   new Date().toISOString(),
      status:      'active'
    });

    // Send MQTT start_charging command
    const mqttService = require('../services/mqttService');
    const { getTariffConfig } = require('../db/tariffConfig');
    const tariff = await getTariffConfig();
    const energyRate = parseFloat(tariff.energy_rate_per_kwh || 12);

    mqttService.publishCommand(booking.kiosk_id, 'start_charging', {
      sessionId,
      energy:        parseFloat(booking.target_energy_kwh),
      energyRate,
      estimatedCost: parseFloat(booking.estimated_amount),
      vehicleType:   'booked'
    });

    // Update booking status
    await db.bookings.updateStatus(id, 'charging');
    await db.kiosks.updateStatus(booking.kiosk_id, 'charging');

    logger.info(`Booking ${id} → charging started. SessionId: ${sessionId}, Kiosk: ${booking.kiosk_id}`);

    return res.status(200).json({
      success:   true,
      sessionId,
      kioskId:   booking.kiosk_id,
      message:   'Charging started from booking'
    });
  } catch (error) {
    logger.error('startChargingFromBooking error: ' + error.message);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/bookings/:id/status — admin update
// ─────────────────────────────────────────────────────────────────────────────
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending_payment','confirmed','active_unlocked','charging','completed','cancelled','no_show'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const booking = await db.bookings.updateStatus(id, status);
    return res.status(200).json({ success: true, booking });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/bookings/:id — cancel booking (legacy)
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await db.bookings.findById(id);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (req.user && !req.isAdmin && booking.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Unauthorized to cancel this booking' });
    }

    const cancellableStatuses = ['pending_payment', 'confirmed'];
    if (!cancellableStatuses.includes(booking.status)) {
      return res.status(400).json({ error: 'Can only cancel bookings that are pending payment or confirmed' });
    }

    await db.bookings.updateStatus(id, 'cancelled');
    return res.status(200).json({ success: true, message: 'Booking cancelled' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bookings/:id/cancel — cancel booking
// ─────────────────────────────────────────────────────────────────────────────
exports.cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await db.bookings.findById(id);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (req.user && !req.isAdmin && booking.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Unauthorized to cancel this booking' });
    }

    const cancellableStatuses = ['pending_payment', 'confirmed'];
    if (!cancellableStatuses.includes(booking.status)) {
      return res.status(400).json({ error: `Cannot cancel a booking in '${booking.status}' status` });
    }

    // 1. Mark booking as cancelled
    await db.bookings.updateStatus(id, 'cancelled');

    // 2. Expire access code if one exists
    const codeRow = await db.slotAccessCodes.findByBookingId(id);
    if (codeRow) {
      await db.slotAccessCodes.updateStatus(codeRow.id, 'expired');
    }

    return res.status(200).json({ success: true, message: 'Booking cancelled successfully' });
  } catch (error) {
    logger.error('cancelBooking error: ' + error.message);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/bookings/kiosk/:kioskId — kiosk availability check
// ─────────────────────────────────────────────────────────────────────────────
exports.getKioskAvailability = async (req, res) => {
  try {
    const { kioskId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    const bookings = await db.bookings.findByKioskAndDate(kioskId, date);
    return res.status(200).json({ success: true, bookings });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin-specific handlers
// ─────────────────────────────────────────────────────────────────────────────

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

    const validStatuses = ['pending_payment','confirmed','active_unlocked','charging','completed','cancelled','no_show'];
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

    const cancellableStatuses = ['pending_payment', 'confirmed'];
    if (!cancellableStatuses.includes(booking.status)) {
      return res.status(400).json({ error: 'Can only cancel pending or confirmed bookings' });
    }

    await db.bookings.updateStatus(id, 'cancelled');
    return res.status(200).json({ success: true, message: 'Booking cancelled' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
