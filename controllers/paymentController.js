const paymentService = require('../services/paymentService');
const mqttService = require('../services/mqttService');
const db = require('../db');
const logger = require('../utils/logger');

exports.handleWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const isValid = paymentService.verifyWebhook(req.body, signature);

    if (!isValid) {
      logger.payment('Webhook signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body.event;
    if (event !== 'payment.captured') {
      return res.status(200).json({ status: 'ignored', event });
    }

    const paymentEntity = req.body.payload.payment.entity;
    const gatewayOrderId = paymentEntity.order_id;
    const gatewayPaymentId = paymentEntity.id;

    const payment = await db.payments.findByGatewayOrderId(gatewayOrderId);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
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

    // Send MQTT command to kiosk
    await mqttService.publishCommand(session.kiosk_id, 'start_charging', {
      sessionId,
      duration: session.requested_duration,
      energy: session.requested_energy,
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

    logger.payment(`Payment confirmed for session ${sessionId}. Charging started on kiosk ${session.kiosk_id}`);
    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    logger.error('Webhook processing error', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
