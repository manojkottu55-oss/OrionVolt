const { supabase } = require('../config/supabaseClient');

async function create(reading) {
  const { data, error } = await supabase
    .from('sensor_readings')
    .insert({
      kiosk_id: reading.kioskId,
      session_id: reading.sessionId || null,
      voltage: reading.voltage,
      current: reading.current,
      power: reading.power,
      timestamp: reading.timestamp || new Date().toISOString()
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function createMany(readings) {
  const rows = readings.map(r => ({
    kiosk_id: r.kioskId,
    session_id: r.sessionId || null,
    voltage: r.voltage,
    current: r.current,
    power: r.power,
    timestamp: r.timestamp || new Date().toISOString()
  }));
  const { data, error } = await supabase
    .from('sensor_readings')
    .insert(rows)
    .select();
  if (error) throw error;
  return data;
}

async function findLatestByKiosk(kioskId) {
  const { data, error } = await supabase
    .from('sensor_readings')
    .select('*')
    .eq('kiosk_id', kioskId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findBySession(sessionId) {
  const { data, error } = await supabase
    .from('sensor_readings')
    .select('*')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function findByKiosk(kioskId, limit = 50) {
  const { data, error } = await supabase
    .from('sensor_readings')
    .select('*')
    .eq('kiosk_id', kioskId)
    .order('timestamp', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

module.exports = { create, createMany, findLatestByKiosk, findBySession, findByKiosk };
