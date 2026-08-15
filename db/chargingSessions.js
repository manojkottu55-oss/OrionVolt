const { supabase } = require('../config/supabaseClient');

async function create(session) {
  const { data, error } = await supabase
    .from('charging_sessions')
    .insert({
      session_id: session.sessionId,
      session_type: session.sessionType,
      kiosk_id: session.kioskId,
      start_time: session.startTime || new Date().toISOString(),
      energy_rate_used: session.energyRateUsed,
      starting_soc: session.startingSoc,
      status: session.status || 'active'
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function findBySessionId(sessionId) {
  const { data, error } = await supabase
    .from('charging_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findActive(kioskId) {
  // Use limit(1) + order so stale duplicate 'active' rows (from interrupted tests)
  // never cause maybeSingle() to throw — we always get the newest active session.
  const { data, error } = await supabase
    .from('charging_sessions')
    .select('*')
    .eq('kiosk_id', kioskId)
    .eq('status', 'active')
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function update(sessionId, fields) {
  // Map camelCase to snake_case
  const mapped = {};
  if (fields.energyDeliveredKwh !== undefined) mapped.energy_delivered_kwh = fields.energyDeliveredKwh;
  if (fields.avgPowerKw !== undefined) mapped.avg_power_kw = fields.avgPowerKw;
  if (fields.durationMinutes !== undefined) mapped.duration_minutes = fields.durationMinutes;
  if (fields.amountPaid !== undefined) mapped.amount_paid = fields.amountPaid;
  if (fields.endingSoc !== undefined) mapped.ending_soc = fields.endingSoc;
  if (fields.avgVoltage !== undefined) mapped.avg_voltage = fields.avgVoltage;
  if (fields.avgCurrent !== undefined) mapped.avg_current = fields.avgCurrent;
  if (fields.status !== undefined) mapped.status = fields.status;
  if (fields.endTime !== undefined) mapped.end_time = fields.endTime;
  if (fields.interruptedReason !== undefined) mapped.interrupted_reason = fields.interruptedReason;

  const { data, error } = await supabase
    .from('charging_sessions')
    .update(mapped)
    .eq('session_id', sessionId)
    .select()
    .maybeSingle(); // was .single() — threw 'multiple rows' when stale active sessions existed
  if (error) throw error;
  return data;
}

async function countToday(startOfDay, endOfDay) {
  const { count, error } = await supabase
    .from('charging_sessions')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay);
  if (error) throw error;
  return count || 0;
}

async function countActive() {
  const { count, error } = await supabase
    .from('charging_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');
  if (error) throw error;
  return count || 0;
}

async function sumEnergyToday(startOfDay, endOfDay) {
  // Fetch all sessions for today and sum in JS (Supabase doesn't have native aggregate)
  const { data, error } = await supabase
    .from('charging_sessions')
    .select('energy_delivered_kwh')
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay);
  if (error) throw error;
  return (data || []).reduce((sum, r) => sum + (r.energy_delivered_kwh || 0), 0);
}

async function findRecent(limit = 5) {
  const { data, error } = await supabase
    .from('charging_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

module.exports = {
  create, findBySessionId, findActive, update,
  countToday, countActive, sumEnergyToday, findRecent
};
