const db = require('../db');
const mqttService = require('../services/mqttService');

exports.getSessionStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await db.signinSessions.findBySessionId(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const chargingSession = await db.chargingSessions.findBySessionId(sessionId);
    
    // Default to the original session's targets
    const targetEnergyKwh = session.requested_energy || 3.5; 
    let energyDeliveredKwh = chargingSession?.energy_delivered_kwh || 0;
    const status = chargingSession?.status || session.status;
    const costSoFar = (energyDeliveredKwh * (chargingSession?.energy_rate_used || 12)).toFixed(2); // Assuming 12 Rs/kWh if not set
    let voltage = 0;
    let current = 0;
    let power = 0;
    let remainingTimeMinutes = 0;
    const interruptedReason = chargingSession?.interrupted_reason || null;
    const refundAmount = null; // Could calculate if interrupted

    // Check for real telemetry
    const latestReading = await db.sensorReadings.findLatestByKiosk(session.kiosk_id);
    let isRealData = false;

    if (latestReading && new Date(latestReading.timestamp) > new Date(Date.now() - 15000)) {
      // Real data within the last 15 seconds
      isRealData = true;
      voltage = latestReading.voltage;
      current = latestReading.current;
      power = latestReading.power;
    } else if (status === 'active' || status === 'charging') {
      // Simulate data based on elapsed time
      const startTime = new Date(chargingSession?.start_time || session.created_at).getTime();
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      
      voltage = 227.5 + 7.5 * Math.sin(elapsedSeconds / 10);
      current = 5.5 + 1.0 * Math.sin(elapsedSeconds / 5);
      power = (voltage * current) / 1000;
      
      // Simulate energy accumulation (power in kW * time in hours)
      energyDeliveredKwh = energyDeliveredKwh + ((power * elapsedSeconds) / 3600);
      
      // Auto-complete if target reached
      if (energyDeliveredKwh >= targetEnergyKwh) {
        energyDeliveredKwh = targetEnergyKwh;
        await db.chargingSessions.update(sessionId, { 
          status: 'completed', 
          energyDeliveredKwh,
          endTime: new Date().toISOString()
        });
        await db.signinSessions.updateStatus(sessionId, 'completed');
      }
    }

    // Estimate remaining time
    if (status === 'completed') {
      remainingTimeMinutes = 0;
    } else if (session.estimated_time_minutes) {
      // Use original estimate minus elapsed time, or base recalculation
      const startTime = new Date(chargingSession?.start_time || session.created_at).getTime();
      const elapsedMinutes = (Date.now() - startTime) / 60000;
      remainingTimeMinutes = Math.max(0, Math.round(session.estimated_time_minutes - elapsedMinutes));
    } else if (power > 0) {
      const remainingEnergy = Math.max(0, targetEnergyKwh - energyDeliveredKwh);
      remainingTimeMinutes = Math.round((remainingEnergy / power) * 60);
    } else {
      remainingTimeMinutes = 0;
    }

    return res.status(200).json({
      success: true,
      status: chargingSession?.status || session.status,
      energyDeliveredKwh,
      targetEnergyKwh,
      voltage,
      current,
      power,
      costSoFar,
      remainingTimeMinutes,
      startingSoc: chargingSession?.starting_soc || 0,
      currentSocEstimate: Math.min(100, (chargingSession?.starting_soc || 0) + (energyDeliveredKwh * 10)), // Dummy calculation
      interruptedReason,
      refundAmount,
      isRealData
    });
  } catch (error) {
    console.error('Error fetching session status:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

exports.stopSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const stoppedAt = new Date().toISOString();

    // 1. Fetch signin session for payment/tariff info
    const signinSession = await db.signinSessions.findBySessionId(sessionId);
    if (!signinSession) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // 2. Fetch the charging session record
    const chargingSession = await db.chargingSessions.findBySessionId(sessionId);

    // 3. Calculate elapsed time and final energy
    const startTime = new Date(chargingSession?.start_time || signinSession.created_at);
    const durationMs = Date.now() - startTime.getTime();
    const durationMinutes = Math.max(1, Math.round(durationMs / 60000));

    // Use real recorded energy if available, otherwise estimate from elapsed time & simulated power
    let finalEnergyKwh = chargingSession?.energy_delivered_kwh || 0;
    if (finalEnergyKwh === 0 && chargingSession) {
      // Estimate from elapsed time using avg power ~1.5 kW (fallback)
      const elapsedHours = durationMs / 3600000;
      finalEnergyKwh = Math.min(
        signinSession.requested_energy || 3.5,
        parseFloat((1.5 * elapsedHours).toFixed(4))
      );
    }
    // Cap to requested target
    finalEnergyKwh = Math.min(finalEnergyKwh, signinSession.requested_energy || finalEnergyKwh);
    finalEnergyKwh = parseFloat(finalEnergyKwh.toFixed(4));

    // 4. Calculate final cost using the energy rate snapshot from session start
    const energyRate = chargingSession?.energy_rate_used || 12; // Rs per kWh
    const finalCost = parseFloat((finalEnergyKwh * energyRate).toFixed(2));

    // 5. Determine refund (amount paid upfront minus actual cost)
    const amountPaid = signinSession.estimated_amount || 0;
    const refundAmount = Math.max(0, parseFloat((amountPaid - finalCost).toFixed(2)));

    // 6. Update charging_sessions row
    //    ┌─ status = 'interrupted'  ← allowed by CHECK constraint
    //    │   ('active' | 'completed' | 'interrupted')
    //    └─ interrupted_reason = 'manual_stop' ← distinguishes this from
    //        hardware faults ('power_cut', 'overcurrent') without needing a new status
    await db.chargingSessions.update(sessionId, {
      status: 'interrupted',
      interruptedReason: 'manual_stop',
      endTime: stoppedAt,
      energyDeliveredKwh: finalEnergyKwh,
      durationMinutes,
    });

    // 7. Update signin_sessions
    //    ┌─ 'completed' is the correct terminal state here
    //    │   ('pending'|'paid'|'charging'|'completed'|'refunded'|'failed')
    //    └─ 'interrupted' is NOT in this table's CHECK constraint
    await db.signinSessions.updateStatus(sessionId, 'completed');

    // 8. Create a refund record if there's money to return
    let refundRecord = null;
    if (refundAmount > 0) {
      // Lookup the payment to get payment_id
      let paymentId = null;
      try {
        const payment = await db.payments.findBySessionId(sessionId, 'paid');
        if (payment) paymentId = payment.id;
      } catch (_) { /* payment lookup is best-effort */ }

      refundRecord = await db.refunds.create({
        sessionId,
        paymentId,
        amountRefunded: refundAmount,
        reason: 'manual_stop',
        status: 'pending',
        processedAt: null,
      });
    }

    // 9. MQTT stop command is skipped until hardware integration is ready
    // mqttService.publishCommand(signinSession.kiosk_id, 'stop_charging', { sessionId });

    return res.status(200).json({
      success: true,
      message: 'Session stopped manually',
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
    console.error('Error stopping session:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};


exports.resumeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Update DB
    await db.chargingSessions.update(sessionId, { 
      status: 'active',
      interruptedReason: null
    });
    await db.signinSessions.updateStatus(sessionId, 'charging');

    const session = await db.signinSessions.findBySessionId(sessionId);
    
    // Mqtt command
    mqttService.publishCommand(session.kiosk_id, 'start_charging', { sessionId });

    return res.status(200).json({ success: true, message: 'Session resumed' });
  } catch (error) {
    console.error('Error resuming session:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
