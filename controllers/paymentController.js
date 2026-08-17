const crypto = require('crypto');
const paymentService = require('../services/paymentService');
const mqttService = require('../services/mqttService');
const config = require('../config');
const db = require('../db');
const logger = require('../utils/logger');

/**
 * POST /api/payment/verify
 * Called from frontend after Razorpay checkout success callback.
 * Verifies the payment signature, marks the payment as paid,
 * creates a charging session, and sends MQTT start command.
 */
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, sessionId } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !sessionId) {
      return res.status(400).json({ error: 'Missing required payment verification fields' });
    }

    // 1. Verify signature using Razorpay KEY_SECRET
    const expectedSignature = crypto
      .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      logger.payment(`Signature mismatch for order ${razorpay_order_id}. Expected: ${expectedSignature}, Got: ${razorpay_signature}`);
      return res.status(400).json({ error: 'Payment verification failed — invalid signature' });
    }

    logger.payment(`Payment signature verified for order ${razorpay_order_id}`);

    // 2. Find and update payment record
    const payment = await db.payments.findByGatewayOrderId(razorpay_order_id);
    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found for this order' });
    }

    await db.payments.updateById(payment.id, {
      status: 'paid',
      gatewayPaymentId: razorpay_payment_id,
      paidAt: new Date().toISOString()
    });

    // 3. Find the session
    let session = await db.signinSessions.findBySessionId(sessionId);
    let sessionType = 'signin';

    if (!session) {
      session = await db.guestSessions.findBySessionId(sessionId);
      sessionType = 'guest';
    }

    if (!session) {
      // Payment is captured but session not found — log it but return success
      logger.payment(`Payment verified but session ${sessionId} not found. Payment ID: ${razorpay_payment_id}`);
      return res.status(200).json({ 
        success: true, 
        verified: true,
        message: 'Payment verified successfully'
      });
    }

    // 4. Update session to paid
    if (sessionType === 'signin') {
      await db.signinSessions.updateStatus(sessionId, 'paid');
    } else {
      await db.guestSessions.updateStatus(sessionId, 'paid');
    }

    // 5. Create charging session
    await db.chargingSessions.create({
      sessionId,
      sessionType,
      kioskId: session.kiosk_id,
      startTime: new Date().toISOString(),
      status: 'active'
    });

    // 6. Send MQTT command to start charging
    try {
      // Fetch the tariff rate so the kiosk knows the cost basis
      // (signin_sessions doesn't store rate, so we read from the same live tariff config)
      const { getTariffConfig } = require('../db/tariffConfig');
      const tariff = await getTariffConfig();
      const energyRate = parseFloat(tariff.energy_rate_per_kwh || 12);

      // Pull the pre-calculated values from the session record
      const targetEnergyKwh = parseFloat(session.requested_energy || 0);
      const estimatedCost   = parseFloat(session.estimated_amount || 0);

      mqttService.publishCommand(session.kiosk_id, 'start_charging', {
        sessionId,
        targetEnergyKwh,       // kWh to deliver (e.g. 2.5)
        energyRate,            // ₹ per kWh (e.g. 12)
        estimatedCost,         // ₹ total (e.g. 30.00)
        vehicleType: session.vehicle_type
      });
      logger.payment(`MQTT start_charging sent to kiosk ${session.kiosk_id} — target: ${targetEnergyKwh} kWh @ ₹${energyRate}/kWh = ₹${estimatedCost}`);
    } catch (mqttErr) {
      logger.error(`MQTT command failed for kiosk ${session.kiosk_id}: ${mqttErr.message}`);
      // Don't fail the response — payment is already captured
    }

    // 7. Update session to charging
    if (sessionType === 'signin') {
      await db.signinSessions.updateStatus(sessionId, 'charging');
    } else {
      await db.guestSessions.updateStatus(sessionId, 'charging');
    }

    // 8. Update kiosk status
    try {
      await db.kiosks.updateStatus(session.kiosk_id, 'charging');
    } catch (kioskErr) {
      logger.error(`Failed to update kiosk status: ${kioskErr.message}`);
    }

    logger.payment(`✅ Payment verified & charging started: session=${sessionId}, kiosk=${session.kiosk_id}, payment=${razorpay_payment_id}`);

    return res.status(200).json({
      success: true,
      verified: true,
      sessionId,
      kioskId: session.kiosk_id,
      message: 'Payment verified — charging started'
    });

  } catch (error) {
    logger.error(`Payment verification error: ${error.message}`, error);
    return res.status(500).json({ error: 'Internal server error during payment verification', details: error.message });
  }
};

/**
 * POST /api/payment/webhook
 * Called by Razorpay servers when a payment event occurs.
 * Acts as a backup to the frontend verify flow.
 */
exports.handleWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const isValid = paymentService.verifyWebhook(req.body, signature);

    if (!isValid) {
      logger.payment('Webhook signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body.event;
    logger.payment(`Webhook received: ${event}`);

    if (event !== 'payment.captured') {
      return res.status(200).json({ status: 'ignored', event });
    }

    const paymentEntity = req.body.payload.payment.entity;
    const gatewayOrderId = paymentEntity.order_id;
    const gatewayPaymentId = paymentEntity.id;

    const payment = await db.payments.findByGatewayOrderId(gatewayOrderId);
    if (!payment) {
      logger.payment(`Webhook: payment not found for order ${gatewayOrderId}`);
      return res.status(404).json({ error: 'Payment not found' });
    }

    // If already paid via verify endpoint, skip
    if (payment.status === 'paid') {
      logger.payment(`Webhook: payment ${gatewayOrderId} already marked as paid — skipping`);
      return res.status(200).json({ status: 'already_processed' });
    }

    // Update payment status
    await db.payments.updateById(payment.id, {
      status: 'paid',
      gatewayPaymentId,
      paidAt: new Date().toISOString()
    });

    const sessionId = payment.session_id;
    let sessionType = 'guest';
    let session = await db.guestSessions.findBySessionId(sessionId);

    if (!session) {
      session = await db.signinSessions.findBySessionId(sessionId);
      sessionType = 'signin';
    }

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Only start charging if not already started
    if (['pending', 'created', 'calculated'].includes(session.status)) {
      // Update session to paid
      if (sessionType === 'guest') {
        await db.guestSessions.updateStatus(sessionId, 'paid');
      } else {
        await db.signinSessions.updateStatus(sessionId, 'paid');
      }

      // Create charging session
      await db.chargingSessions.create({
        sessionId,
        sessionType,
        kioskId: session.kiosk_id,
        startTime: new Date().toISOString(),
        status: 'active'
      });

      // Fetch the tariff rate so the kiosk knows the cost basis
      const { getTariffConfig } = require('../db/tariffConfig');
      const tariff = await getTariffConfig();
      const energyRate = parseFloat(tariff.energy_rate_per_kwh || 12);

      // Pull the pre-calculated values from the session record
      const targetEnergyKwh = parseFloat(session.requested_energy || 0);
      const estimatedCost   = parseFloat(session.estimated_amount || 0);

      // Send MQTT command to kiosk
      await mqttService.publishCommand(session.kiosk_id, 'start_charging', {
        sessionId,
        targetEnergyKwh,       // kWh to deliver (e.g. 2.5)
        energyRate,            // ₹ per kWh (e.g. 12)
        estimatedCost,         // ₹ total (e.g. 30.00)
        vehicleType: session.vehicle_type
      });

      // Update session to charging
      if (sessionType === 'guest') {
        await db.guestSessions.updateStatus(sessionId, 'charging');
      } else {
        await db.signinSessions.updateStatus(sessionId, 'charging');
      }

      // Update kiosk status
      await db.kiosks.updateStatus(session.kiosk_id, 'charging');

      logger.payment(`Webhook: Payment confirmed for session ${sessionId}. Charging started on kiosk ${session.kiosk_id}`);
    } else {
      logger.payment(`Webhook: Session ${sessionId} already in status '${session.status}' — skipping charging start`);
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    logger.error('Webhook processing error: ' + error.message, error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/**
 * POST /api/payment/demo-verify
 * Mock verification for prototype without Razorpay signatures.
 */
exports.demoVerifyPayment = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    // 1. Find the session
    let session = await db.signinSessions.findBySessionId(sessionId);
    let sessionType = 'signin';

    if (!session) {
      session = await db.guestSessions.findBySessionId(sessionId);
      sessionType = 'guest';
    }

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // 2. Create a payments record so Admin Payments page is populated
    const demoOrderId  = `DEMO_${sessionId.replace(/-/g, '').substring(0, 14)}`;
    const demoPayId    = `demo_pay_${Date.now()}`;
    try {
      // Only insert if no payment record exists yet for this session
      const existing = await db.payments.findBySessionId(sessionId);
      if (!existing) {
        await db.payments.create({
          sessionId,
          orderId:          demoOrderId,
          amount:           session.estimated_amount || 0,
          gatewayOrderId:   demoOrderId,
          gatewayPaymentId: demoPayId,
          status:           'paid',
          paidAt:           new Date().toISOString()
        });
      }
    } catch (payErr) {
      // Non-fatal — log and continue
      logger.error(`Demo payment record creation failed: ${payErr.message}`);
    }

    // 3. Create charging session
    await db.chargingSessions.create({
      sessionId,
      sessionType,
      kioskId: session.kiosk_id,
      startTime: new Date().toISOString(),
      status: 'active'
    });

    // 4. Send MQTT command to start charging
    try {
      // Fetch the tariff rate so the kiosk knows the cost basis
      const { getTariffConfig } = require('../db/tariffConfig');
      const tariff = await getTariffConfig();
      const energyRate = parseFloat(tariff.energy_rate_per_kwh || 12);

      // Pull the pre-calculated values from the session record
      const targetEnergyKwh = parseFloat(session.requested_energy || 0);
      const estimatedCost   = parseFloat(session.estimated_amount || 0);

      await mqttService.publishCommand(session.kiosk_id, 'start_charging', {
        sessionId,
        targetEnergyKwh,       // kWh to deliver (e.g. 2.5)
        energyRate,            // ₹ per kWh (e.g. 12)
        estimatedCost,         // ₹ total (e.g. 30.00)
        vehicleType: session.vehicle_type
      });
      logger.payment(`MQTT start_charging sent to kiosk ${session.kiosk_id}`);
    } catch (mqttErr) {
      logger.error(`MQTT command failed for kiosk ${session.kiosk_id}: ${mqttErr.message}`);
    }

    // 5. Update session to charging
    if (sessionType === 'signin') {
      await db.signinSessions.updateStatus(sessionId, 'charging');
    } else {
      await db.guestSessions.updateStatus(sessionId, 'charging');
    }

    // 6. Update kiosk status
    try {
      await db.kiosks.updateStatus(session.kiosk_id, 'charging');
    } catch (kioskErr) {
      logger.error(`Failed to update kiosk status: ${kioskErr.message}`);
    }

    logger.payment(`✅ Demo Payment verified & charging started: session=${sessionId}`);

    return res.status(200).json({
      success: true,
      verified: true,
      sessionId,
      kioskId: session.kiosk_id,
      message: 'Payment verified — charging started'
    });

  } catch (error) {
    logger.error(`Demo Payment verification error: ${error.message}`, error);
    return res.status(500).json({ error: 'Internal server error during payment verification', details: error.message });
  }
};

