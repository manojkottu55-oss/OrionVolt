const { supabase } = require('../config/supabaseClient');

async function create(session) {
  const { data, error } = await supabase
    .from('guest_sessions')
    .insert({
      session_id: session.sessionId,
      mobile_number: session.mobileNumber,
      kiosk_id: session.kioskId,
      vehicle_type: session.vehicleType,
      vehicle_id: session.vehicleId || null,
      target_type: session.targetType || 'energy',
      target_value: session.targetValue || 0,
      requested_duration: session.requestedDuration,
      requested_energy: session.requestedEnergy,
      estimated_amount: session.estimatedAmount,
      status: session.status || 'pending'
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function findBySessionId(sessionId) {
  const { data, error } = await supabase
    .from('guest_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function updateStatus(sessionId, status) {
  const { error } = await supabase
    .from('guest_sessions')
    .update({ status })
    .eq('session_id', sessionId);
  if (error) throw error;
}

async function findWithFilter(filter = {}) {
  let query = supabase.from('guest_sessions').select('*');
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.createdAtGte) query = query.gte('created_at', filter.createdAtGte);
  if (filter.createdAtLte) query = query.lte('created_at', filter.createdAtLte);
  query = query.order('created_at', { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function update(sessionId, fields) {
  const mapped = {};
  if (fields.vehicleType      !== undefined) mapped.vehicle_type       = fields.vehicleType;
  if (fields.vehicleMake      !== undefined) mapped.vehicle_make       = fields.vehicleMake;
  if (fields.vehicleModel     !== undefined) mapped.vehicle_model      = fields.vehicleModel;
  if (fields.vehicleId        !== undefined) mapped.vehicle_id         = fields.vehicleId;
  if (fields.targetType       !== undefined) mapped.target_type        = fields.targetType;
  if (fields.targetValue      !== undefined) mapped.target_value       = fields.targetValue;
  if (fields.requestedEnergy  !== undefined) mapped.requested_energy   = fields.requestedEnergy;
  if (fields.requestedDuration!== undefined) mapped.requested_duration = fields.requestedDuration;
  if (fields.estimatedAmount  !== undefined) mapped.estimated_amount   = fields.estimatedAmount;
  if (fields.status           !== undefined) mapped.status             = fields.status;

  const { data, error } = await supabase
    .from('guest_sessions')
    .update(mapped)
    .eq('session_id', sessionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

module.exports = { create, findBySessionId, update, updateStatus, findWithFilter };
