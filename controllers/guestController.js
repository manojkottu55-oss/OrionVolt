const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const paymentService = require('../services/paymentService');
const mqttService = require('../services/mqttService');
const tariff = require('../config/tariff');
const { isValidMobile, isValidEnum } = require('../middleware/validate');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/guest/session
// Step 1 of kiosk guest flow — register mobile number, link to kiosk.
// vehicleType is optional here; provided in PATCH below.
// ─────────────────────────────────────────────────────────────────────────────
exports.createSession = async (req, res) => {
  try {
    const { mobileNumber, kioskId, vehicleType, duration, energy, targetType, targetValue, vehicleId } = req.body;

    if (!isValidMobile(mobileNumber)) {
      return res.status(400).json({ error: 'Invalid mobile number. Must be 10 digits.' });
    }

    if (vehicleType && !isValidEnum(vehicleType, tariff.VEHICLE_TYPES)) {
      return res.status(400).json({ error: 'Invalid vehicle type.' });
    }

    let vehicleObj = null;
    if (vehicleId) {
      vehicleObj = await db.vehicleMaster.findById(vehicleId);
      if (!vehicleObj) {
        return res.status(404).json({ error: 'Vehicle not found' });
      }
    }

    const kiosk = await db.kiosks.findOne(kioskId);
    if (!kiosk) {
      return res.status(404).json({ error: `Kiosk '${kioskId}' not found` });
    }

    // Map Supabase snake_case vehicle to the format tariff expects
    const vehicleForTariff = vehicleObj ? {
      type: vehicleObj.type,
      batteryCapacityKwh: vehicleObj.battery_capacity_kwh
    } : null;

    // estimatedAmount defaults to 0 at creation; recalculated in PATCH below
    const estimatedAmount = (vehicleType || vehicleForTariff)
      ? await tariff.calculateEstimate(
          vehicleType || (vehicleForTariff ? vehicleForTariff.type : 'four_wheeler'),
          duration || 0,
          energy || 0,
          targetType || 'energy',
          targetValue || 0,
          vehicleForTariff
        )
      : 0;

    const session = await db.guestSessions.create({
      sessionId: uuidv4(),
      mobileNumber,
      kioskId,
      vehicleType: vehicleType || null,
      vehicleId: vehicleId || null,
      targetType: targetType || 'energy',
      targetValue: targetValue || 0,
      requestedDuration: duration || null,
      requestedEnergy: energy || null,
      estimatedAmount,
      status: 'pending'
    });

    return res.status(201).json({
      success: true,
      sessionId: session.session_id,
      session
    });
  } catch (error) {
    logger.error(`createGuestSession error: ${error.message}`);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/guest/session/:sessionId
// Step 2 — kiosk selects vehicle type/make/model + charging mode.
// Runs tariff calculation and returns the cost estimate.
// ─────────────────────────────────────────────────────────────────────────────
exports.updateSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { vehicleType, vehicleMake, vehicleModel, vehicleId, chargingMode, modeValue } = req.body;

    const session = await db.guestSessions.findBySessionId(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Guest session not found' });
    }
    if (session.status !== 'pending') {
      return res.status(400).json({ error: `Session is already in status '${session.status}' — cannot update` });
    }

    // Validate vehicleType if provided
    if (vehicleType && !isValidEnum(vehicleType, tariff.VEHICLE_TYPES)) {
      return res.status(400).json({ error: 'Invalid vehicle type' });
    }

    // Lookup vehicle object for battery capacity (used in % / full_charge calculations)
    let vehicleObj = null;
    if (vehicleId) {
      vehicleObj = await db.vehicleMaster.findById(vehicleId);
      if (!vehicleObj) {
        return res.status(404).json({ error: `Vehicle id '${vehicleId}' not found in vehicle_master` });
      }
    }

    // Map chargingMode → tariff targetType + targetValue
    // chargingMode: 'amount' | 'energy' | 'percentage' | 'full_charge'
    // modeValue: the amount (Rs), energy (kWh), or percentage — ignored for full_charge
    const targetType  = chargingMode || 'energy';
    const targetValue = modeValue != null ? parseFloat(modeValue) : 0;

    const vehicleForTariff = vehicleObj ? {
      type: vehicleObj.type,
      batteryCapacityKwh: vehicleObj.battery_capacity_kwh
    } : null;

    const resolvedVehicleType = vehicleType || (vehicleObj ? vehicleObj.type : session.vehicle_type) || 'four_wheeler';

    // Calculate estimated cost, energy, and time using existing tariff logic
    const tariffConfig = await db.tariffConfig.getTariffConfig();
    const costPerKwh   = tariffConfig.energy_rate_per_kwh;

    const estimatedAmount = await tariff.calculateEstimate(
      resolvedVehicleType,
      0,           // duration not used in kiosk guest flow
      targetType === 'energy' ? targetValue : 0,
      targetType,
      targetValue,
      vehicleForTariff
    );

    // Derive energy and time from the estimated cost
    const estimatedEnergyKwh     = costPerKwh > 0
      ? parseFloat((estimatedAmount / costPerKwh).toFixed(4))
      : 0;
    const avgChargingPowerKw     = 1.5; // conservative fallback, ~1.5 kW for mixed fleet
    const estimatedTimeMinutes   = estimatedEnergyKwh > 0
      ? Math.round((estimatedEnergyKwh / avgChargingPowerKw) * 60)
      : 0;

    // Persist updates to guest_sessions row
    const updated = await db.guestSessions.update(sessionId, {
      vehicleType:  resolvedVehicleType,
      vehicleMake:  vehicleMake  || null,
      vehicleModel: vehicleModel || null,
      vehicleId:    vehicleId    || null,
      targetType,
      targetValue,
      requestedEnergy: targetType === 'energy' ? targetValue : estimatedEnergyKwh,
      estimatedAmount,
    });

    return res.status(200).json({
      success: true,
      sessionId,
      estimatedCost:         parseFloat(estimatedAmount.toFixed(2)),
      estimatedEnergyKwh,
      estimatedTimeMinutes,
      session: updated
    });
  } catch (error) {
    logger.error(`updateGuestSession error: ${error.message}`);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/guest/session/:sessionId/create-payment
// Step 3 — creates a Razorpay order and returns the payment link URL
//           (to be encoded as QR on the kiosk screen).
// ─────────────────────────────────────────────────────────────────────────────
exports.createPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const session = await db.guestSessions.findBySessionId(id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'pending') {
      return res.status(400).json({ error: `Session is not in pending state (current: '${session.status}')` });
    }

    if (!session.estimated_amount || session.estimated_amount <= 0) {
      return res.status(400).json({ error: 'Session has no estimated amount — call PATCH /session/:id first to set vehicle and charging mode' });
    }

    const { orderId, gatewayOrderId } = await paymentService.createOrder(session.estimated_amount, session.session_id);

    await db.payments.create({
      sessionId:      session.session_id,
      orderId,
      amount:         session.estimated_amount,
      gatewayOrderId,
      status:         'created'
    });

    // Build a Razorpay payment link URL for QR code display on kiosk
    // The user scans this URL with their phone to complete UPI / card payment
    const paymentLink = `https://rzp.io/i/${gatewayOrderId}`;

    return res.status(200).json({
      success: true,
      payment: {
        orderId,
        gatewayOrderId,
        amount:      session.estimated_amount,
        currency:    'INR',
        paymentLink, // ← encode this as QR on kiosk screen
      }
    });
  } catch (error) {
    logger.error(`guestCreatePayment error: ${error.message}`);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/guest/session/:sessionId/payment-status
// Step 4 — ESP32 polls this after showing QR to detect payment completion.
// Returns { status: "pending" | "paid" | "failed" }
// ─────────────────────────────────────────────────────────────────────────────
exports.getPaymentStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await db.guestSessions.findBySessionId(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Guest session not found' });
    }

    const payment = await db.payments.findBySessionId(sessionId);
    if (!payment) {
      // No payment record yet (order not created yet)
      return res.status(200).json({ success: true, status: 'pending' });
    }

    // Map DB payment status → simplified poll status
    let status = 'pending';
    if (payment.status === 'paid') {
      status = 'paid';
    } else if (payment.status === 'failed') {
      status = 'failed';
    }

    return res.status(200).json({ success: true, status, paymentId: payment.id });
  } catch (error) {
    logger.error(`guestGetPaymentStatus error: ${error.message}`);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/guest/session/:sessionId/verify-stop
// Step 5 — user enters mobile on kiosk keypad to stop charging.
// Validates mobile number match, then stops session and calculates refund.
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyStop = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { mobileNumber } = req.body;

    if (!mobileNumber) {
      return res.status(400).json({ error: 'mobileNumber is required' });
    }

    // 1. Fetch guest session
    const guestSession = await db.guestSessions.findBySessionId(sessionId);
    if (!guestSession) {
      return res.status(404).json({ error: 'Guest session not found' });
    }

    // 2. Verify mobile number (guest auth)
    if (guestSession.mobile_number !== mobileNumber) {
      return res.status(403).json({ error: 'Mobile number does not match this session' });
    }

    // 3. Confirm session is actually charging
    if (guestSession.status !== 'charging') {
      return res.status(400).json({ error: `Session is not currently charging (status: '${guestSession.status}')` });
    }

    const stoppedAt = new Date().toISOString();

    // 4. Fetch linked charging_sessions row (created by payment verify step)
    const chargingSession = await db.chargingSessions.findBySessionId(sessionId);

    // 5. Calculate elapsed time + final energy (same logic as sessionsController.stopSession)
    const startTime      = new Date(chargingSession?.start_time || guestSession.created_at);
    const durationMs     = Date.now() - startTime.getTime();
    const durationMinutes = Math.max(1, Math.round(durationMs / 60000));

    let finalEnergyKwh = chargingSession?.energy_delivered_kwh || 0;
    if (finalEnergyKwh === 0 && chargingSession) {
      const elapsedHours = durationMs / 3600000;
      finalEnergyKwh = Math.min(
        guestSession.requested_energy || 3.5,
        parseFloat((1.5 * elapsedHours).toFixed(4))
      );
    }
    finalEnergyKwh = Math.min(finalEnergyKwh, guestSession.requested_energy || finalEnergyKwh);
    finalEnergyKwh = parseFloat(finalEnergyKwh.toFixed(4));

    // 6. Final cost + refund
    const energyRate  = chargingSession?.energy_rate_used || 12;
    const finalCost   = parseFloat((finalEnergyKwh * energyRate).toFixed(2));
    const amountPaid  = guestSession.estimated_amount || 0;
    const refundAmount = Math.max(0, parseFloat((amountPaid - finalCost).toFixed(2)));

    // 7. Update charging_sessions → interrupted (manual_stop)
    if (chargingSession) {
      await db.chargingSessions.update(sessionId, {
        status:            'interrupted',
        interruptedReason: 'manual_stop',
        endTime:           stoppedAt,
        energyDeliveredKwh: finalEnergyKwh,
        durationMinutes,
      });
    }

    // 8. Update guest_sessions → completed
    await db.guestSessions.updateStatus(sessionId, 'completed');

    // 9. Create refund record if applicable
    let refundRecord = null;
    if (refundAmount > 0) {
      let paymentId = null;
      try {
        const payment = await db.payments.findBySessionId(sessionId, 'paid');
        if (payment) paymentId = payment.id;
      } catch (_) { /* best-effort */ }

      refundRecord = await db.refunds.create({
        sessionId,
        paymentId,
        amountRefunded: refundAmount,
        reason:         'manual_stop',
        status:         'pending',
        processedAt:    null,
      });
    }

    // 10. MQTT stop command — publish to kiosk relay
    try {
      await mqttService.publishCommand(guestSession.kiosk_id, 'stop_charging', { sessionId });
      logger.payment(`MQTT stop_charging sent to kiosk ${guestSession.kiosk_id} for guest session ${sessionId}`);
    } catch (mqttErr) {
      logger.error(`MQTT stop command failed for kiosk ${guestSession.kiosk_id}: ${mqttErr.message}`);
      // Non-fatal — session is already marked stopped in DB
    }

    logger.payment(`Guest session ${sessionId} stopped manually by mobile ${mobileNumber}`);

    return res.status(200).json({
      success: true,
      message: 'Charging stopped',
      summary: {
        energyDeliveredKwh: finalEnergyKwh,
        durationMinutes,
        finalCost,
        amountPaid,
        refundAmount,
        refundStatus: refundAmount > 0 ? 'pending' : null,
        stoppedAt,
      }
    });
  } catch (error) {
    logger.error(`guestVerifyStop error: ${error.message}`);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/guest/session/:id  (existing — unchanged)
// Returns session + live charging data for kiosk display
// ─────────────────────────────────────────────────────────────────────────────
exports.getSession = async (req, res) => {
  try {
    const { id } = req.params;
    const session = await db.guestSessions.findBySessionId(id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const chargingSession = await db.chargingSessions.findBySessionId(id);
    const latestReading   = await db.sensorReadings.findLatestByKiosk(session.kiosk_id);

    return res.status(200).json({
      success: true,
      session,
      chargingSession: chargingSession || null,
      latestReading:   latestReading   || null
    });
  } catch (error) {
    logger.error(`guestGetSession error: ${error.message}`);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
