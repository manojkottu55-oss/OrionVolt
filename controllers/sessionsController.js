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
    
    // Update DB
    await db.chargingSessions.update(sessionId, { 
      status: 'stopped_manual',
      interruptedReason: 'manual_stop',
      endTime: new Date().toISOString()
    });
    await db.signinSessions.updateStatus(sessionId, 'interrupted');

    // Mqtt command could be sent here
    // mqttService.publish(kioskId, 'stop_charging');

    return res.status(200).json({ success: true, message: 'Session stopped manually' });
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
