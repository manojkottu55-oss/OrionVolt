const mqtt = require('mqtt');
const config = require('../config');
const mqttConfig = require('../config/mqtt');
const logger = require('../utils/logger');
const db = require('../db');
const { getTariffConfig } = require('../db/tariffConfig');

// Store last telemetry times in memory for delta-t calculations
const lastTelemetryTime = new Map();

// Module-level client variable
let client;

/**
 * Handle incoming telemetry data from a kiosk
 * @param {string} kioskId 
 * @param {object} data 
 */
async function handleTelemetry(kioskId, data) {
    try {
        // Find active charging session for this kiosk
        const chargingSession = await db.chargingSessions.findActive(kioskId);
        
        // Save new SensorReading
        await db.sensorReadings.create({
            kioskId,
            sessionId: chargingSession ? chargingSession.session_id : null,
            voltage: data.voltage,
            current: data.current,
            power: data.power,
            timestamp: data.timestamp || new Date().toISOString()
        });

        if (chargingSession) {
            // 1. Snapshot tariff rate if not already done
            if (!chargingSession.energy_rate_used) {
                const tariff = await getTariffConfig();
                chargingSession.energy_rate_used = tariff.energy_rate_per_kwh || 12;
            }

            // 2. Calculate Power and Energy
            const now = new Date(data.timestamp || new Date().toISOString());
            const lastTime = lastTelemetryTime.get(chargingSession.session_id) || new Date(chargingSession.start_time);
            const deltaHours = (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60);
            
            const powerKw = data.power !== undefined ? data.power : ((data.voltage || 0) * (data.current || 0) / 1000);
            
            // If device sends energy, use it, else calculate integration
            let energyDeliveredKwh = parseFloat(chargingSession.energy_delivered_kwh || 0);
            if (data.energyUsedKwh !== undefined) {
                energyDeliveredKwh = data.energyUsedKwh;
            } else if (deltaHours > 0 && deltaHours < 1) {
                energyDeliveredKwh += (powerKw * deltaHours);
            }

            lastTelemetryTime.set(chargingSession.session_id, now);
            
            // 3. Update session duration and amount paid
            const sessionDurationMs = now.getTime() - new Date(chargingSession.start_time).getTime();
            const durationMinutes = sessionDurationMs / 60000;
            const amountPaid = energyDeliveredKwh * chargingSession.energy_rate_used;

            const updateFields = {
                energyDeliveredKwh,
                avgPowerKw: powerKw,
                durationMinutes,
                amountPaid,
                energyRateUsed: chargingSession.energy_rate_used,
                avgVoltage: data.voltage,
                avgCurrent: data.current
            };

            // 4. Check for auto-stop (target met)
            let shouldAutoStop = false;
            let parentSession = await db.guestSessions.findBySessionId(chargingSession.session_id) 
                             || await db.signinSessions.findBySessionId(chargingSession.session_id);

            if (parentSession) {
                // Determine target energy
                let targetEnergy = null;
                if (parentSession.target_type === 'amount' && parentSession.target_value) {
                    targetEnergy = parentSession.target_value / chargingSession.energy_rate_used;
                } else if (parentSession.target_type === 'percentage' && parentSession.target_value) {
                    // Assuming vehicle capacity is fetched somewhere, but if we don't have it here, 
                    // we might need to rely on estimated_energy if we stored it, or stop based on amount_paid.
                    // If target is amount:
                    if (amountPaid >= parentSession.target_value) shouldAutoStop = true;
                }
                
                // If we calculated targetEnergy
                if (targetEnergy && energyDeliveredKwh >= targetEnergy) {
                    shouldAutoStop = true;
                }
                
                // If mode is amount, stop when amountPaid >= target_value
                if (parentSession.target_type === 'amount' && amountPaid >= parentSession.target_value) {
                    shouldAutoStop = true;
                }
            }

            // Add a grace period for early "stopped" telemetry (e.g. from relay startup delay)
            let isGenuineStop = data.chargerStatus === 'stopped';
            if (isGenuineStop && sessionDurationMs < 5000 && energyDeliveredKwh < 0.01) {
                logger.mqtt(`Ignoring 'stopped' status from ${kioskId} as session just started (${Math.round(sessionDurationMs)}ms ago).`);
                isGenuineStop = false; // Treat as normal telemetry until genuine stop
            }

            // Check for fault/interruption
            if (data.chargerStatus === 'fault' || isGenuineStop || shouldAutoStop) {
                updateFields.status = shouldAutoStop ? 'completed' : 'interrupted';
                updateFields.endTime = new Date().toISOString();
                
                if (data.chargerStatus === 'fault') {
                    updateFields.interruptedReason = 'power_cut';
                } else if (isGenuineStop) {
                    updateFields.interruptedReason = 'manual_stop';
                } else if (shouldAutoStop) {
                    updateFields.status = 'completed'; // auto-stop is normal completion
                    updateFields.interruptedReason = 'none';
                    // send command to kiosk to stop charging
                    publishCommand(kioskId, 'STOP_CHARGE', { sessionId: chargingSession.session_id });
                } else {
                    updateFields.interruptedReason = 'overcurrent';
                }
                
                await db.chargingSessions.update(chargingSession.session_id, updateFields);
                lastTelemetryTime.delete(chargingSession.session_id);
                
                // Update parent session
                if (parentSession) {
                    const model = parentSession.mobile_number ? db.guestSessions : db.signinSessions;
                    await model.updateStatus(chargingSession.session_id, updateFields.status);
                }

                // Import refundService lazily to avoid circular dependency
                if (updateFields.status === 'interrupted' || amountPaid < parentSession?.target_value) {
                    const refundService = require('./refundService');
                    await refundService.processAutoRefund(chargingSession.session_id);
                }
                
                logger.mqtt(`Session ${chargingSession.session_id} ended: ${updateFields.status}`);
            } 
            // Check for normal completion from device
            else if (data.sessionStatus === 'completed') {
                updateFields.status = 'completed';
                updateFields.endTime = new Date().toISOString();
                await db.chargingSessions.update(chargingSession.session_id, updateFields);
                lastTelemetryTime.delete(chargingSession.session_id);
                
                if (parentSession) {
                    const model = parentSession.mobile_number ? db.guestSessions : db.signinSessions;
                    await model.updateStatus(chargingSession.session_id, 'completed');
                }
                
                logger.mqtt(`Session ${chargingSession.session_id} completed normally`);
            } else {
                await db.chargingSessions.update(chargingSession.session_id, updateFields);
            }
        }
    } catch (err) {
        logger.error(`Error handling telemetry for ${kioskId}: ${err.message}`);
    }
}

/**
 * Handle incoming status data from a kiosk
 * @param {string} kioskId 
 * @param {object} data 
 */
async function handleStatus(kioskId, data) {
    try {
        // Map ESP32 statuses to allowed DB statuses ('online', 'offline', 'charging', 'fault')
        let normalizedStatus = data.status ? data.status.toLowerCase() : 'offline';
        const validStatuses = ['online', 'offline', 'charging', 'fault'];
        
        if (!validStatuses.includes(normalizedStatus)) {
            // Log a clear warning with the exact value the ESP32 sent
            logger.warn(`ESP32 sent unmapped status '${data.status}' for kiosk ${kioskId}. Mapping to a valid state.`);
            
            // Normalize common ESP32 states
            if (['idle', 'ready', 'available', 'connected'].includes(normalizedStatus)) {
                normalizedStatus = 'online';
            } else if (['disconnected', 'error', 'maintenance'].includes(normalizedStatus)) {
                normalizedStatus = 'offline';
            } else {
                normalizedStatus = 'online'; // Safe fallback so we don't break the insert
            }
        }

        await db.kiosks.upsert(kioskId, {
            status: normalizedStatus,
            last_seen: new Date().toISOString(),
            location: data.location || 'Unknown'
        });
        logger.mqtt(`Kiosk ${kioskId} status updated to: ${normalizedStatus} (original: ${data.status})`);
    } catch (err) {
        // Include the exact status that caused the failure in the error log
        logger.error(`Error handling status for ${kioskId} (received status: '${data.status}'): ${err.message}`);
    }
}

/**
 * Handle access code verification from kiosk keypad
 * ESP32 publishes: { accessCode: "1234" } to orionvolt/{kioskId}/access-verify
 * Backend responds on orionvolt/{kioskId}/access-result with { valid: true/false, ... }
 * @param {string} kioskId
 * @param {object} data
 */
async function handleAccessVerify(kioskId, data) {
    const { accessCode } = data;
    const resultTopic = mqttConfig.topics.accessResult(kioskId);

    if (!accessCode) {
        client.publish(resultTopic, JSON.stringify({ valid: false, reason: 'No access code provided' }));
        return;
    }

    try {
        const codeRecord = await db.slotAccessCodes.findByKioskAndCode(kioskId, accessCode);

        if (!codeRecord) {
            logger.mqtt(`Access verify FAILED for ${kioskId}: code ${accessCode} not found`);
            client.publish(resultTopic, JSON.stringify({ valid: false, reason: 'Invalid access code' }), { qos: 1 });
            return;
        }

        const now = new Date();
        const validFrom  = new Date(codeRecord.valid_from);
        const validUntil = new Date(codeRecord.valid_until);

        if (now < validFrom) {
            logger.mqtt(`Access verify FAILED for ${kioskId}: too early (slot starts at ${validFrom.toISOString()})`);
            client.publish(resultTopic, JSON.stringify({ valid: false, reason: 'Slot not started yet' }), { qos: 1 });
            return;
        }

        if (now > validUntil) {
            logger.mqtt(`Access verify FAILED for ${kioskId}: slot expired at ${validUntil.toISOString()}`);
            await db.slotAccessCodes.updateStatus(codeRecord.id, 'expired');
            client.publish(resultTopic, JSON.stringify({ valid: false, reason: 'Slot time has expired' }), { qos: 1 });
            return;
        }

        // Validate the linked booking
        const booking = codeRecord.slot_bookings;
        if (!booking || booking.status !== 'confirmed') {
            logger.mqtt(`Access verify FAILED for ${kioskId}: booking status is ${booking?.status}`);
            client.publish(resultTopic, JSON.stringify({ valid: false, reason: 'Booking is not in confirmed state' }), { qos: 1 });
            return;
        }

        // ✅ Code is valid — mark used, unlock booking
        await db.slotAccessCodes.updateStatus(codeRecord.id, 'used');
        await db.bookings.updateStatus(booking.id, 'active_unlocked');

        logger.mqtt(`Access verify SUCCESS for ${kioskId}: code ${accessCode}, booking ${booking.id} → active_unlocked`);
        client.publish(resultTopic, JSON.stringify({
            valid:       true,
            bookingId:   booking.id,
            sessionInfo: `Booked for ${Math.round((validUntil - now) / 60000)} min remaining`
        }), { qos: 1 });

    } catch (err) {
        logger.error(`handleAccessVerify error for ${kioskId}: ${err.message}`);
        client.publish(resultTopic, JSON.stringify({ valid: false, reason: 'Internal error' }), { qos: 1 });
    }
}

/**
 * Initialize the MQTT client and subscriptions
 */
function init() {
    client = mqtt.connect(config.MQTT_BROKER_URL);

    client.on('connect', () => {
        logger.mqtt('Connected to MQTT broker');
        client.subscribe(mqttConfig.SUBSCRIBE_TOPICS, { qos: mqttConfig.QOS.TELEMETRY }, (err) => {
            if (err) logger.error(`MQTT Subscription error: ${err.message}`);
        });
    });

    client.on('message', async (topic, message) => {
        const parsed = mqttConfig.parseTopic(topic);
        if (!parsed) return;
        const { kioskId, messageType } = parsed;

        try {
            const rawString = message.toString();
            const data = JSON.parse(rawString);
            
            if (messageType === 'telemetry') {
                // If it's stopped or idle, check if we recently sent a start_charging command
                if (data.chargerStatus === 'stopped' || data.chargerStatus === 'idle') {
                    const startCmdTime = module.exports.lastStartCommandTime?.get(kioskId);
                    if (startCmdTime) {
                        const diffSec = (new Date().getTime() - startCmdTime.getTime()) / 1000;
                        if (diffSec < 15) { // within 15 seconds of start_charging
                            logger.mqtt(`[DEBUG-TELEMETRY] Received '${data.chargerStatus}' telemetry for ${kioskId} exactly ${diffSec.toFixed(2)}s after start_charging. RAW MESSAGE: ${rawString}`);
                        }
                    }
                }
                logger.mqtt(`Received telemetry from ${kioskId}: ${rawString}`);
                await handleTelemetry(kioskId, data);
            } else if (messageType === 'status') {
                logger.mqtt(`Received status from ${kioskId}: ${rawString}`);
                await handleStatus(kioskId, data);
            } else if (messageType === 'access-verify') {
                logger.mqtt(`Received access-verify from ${kioskId}: ${rawString}`);
                await handleAccessVerify(kioskId, data);
            }
        } catch (err) {
            logger.error(`Failed to parse MQTT message on topic ${topic}: ${err.message}`);
        }
    });

    client.on('error', (err) => {
        logger.error('MQTT error: ' + err.message);
    });

    client.on('close', () => {
        logger.mqtt('MQTT connection closed');
    });
}

/**
 * Publish a command to a specific kiosk
 * @param {string} kioskId 
 * @param {string} action 
 * @param {object} payload 
 */
function publishCommand(kioskId, action, payload) {
    if (!client || !client.connected) {
        logger.error(`Cannot publish command ${action} to ${kioskId}: MQTT not connected`);
        return;
    }
    
    const topic = mqttConfig.topics.command(kioskId);
    // ESP32 firmware expects nested structure: { action, payload: {...}, timestamp }
    const message = JSON.stringify({
        action,
        payload: payload || {},
        timestamp: new Date().toISOString()
    });
    
    if (action === 'start_charging') {
        if (!module.exports.lastStartCommandTime) module.exports.lastStartCommandTime = new Map();
        module.exports.lastStartCommandTime.set(kioskId, new Date());
        logger.mqtt(`[DEBUG-PUBLISH] EXACT RAW PUBLISHED start_charging PAYLOAD for ${kioskId}: ${message}`);
    } else if (action === 'update_screen') {
        logger.mqtt(`[DEBUG-PUBLISH] EXACT RAW PUBLISHED update_screen PAYLOAD for ${kioskId}: ${message}`);
    }
    
    client.publish(topic, message, { qos: mqttConfig.QOS.COMMAND }, (err) => {
        if (err) {
            logger.error(`Error publishing command to ${kioskId}: ${err.message}`);
        } else {
            logger.mqtt(`Command sent to ${kioskId}: ${action}`);
        }
    });
}

module.exports = {
    init,
    publishCommand,
    lastStartCommandTime: new Map()
};
