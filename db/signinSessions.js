const { supabase } = require('../config/supabaseClient');

async function create(session) {
  const { data, error } = await supabase
    .from('signin_sessions')
    .insert({
      session_id: session.sessionId,
      user_id: session.userId,
      kiosk_id: session.kioskId,
      vehicle_type: session.vehicleType,
      vehicle_id: session.vehicleId || null,
      target_type: session.targetType || 'energy',
      target_value: session.targetValue || 0,
      requested_duration: session.requestedDuration,
      requested_energy: session.requestedEnergy,
      estimated_amount: session.estimatedAmount,
      status: session.status || 'pending',
      qr_login_token: session.qrLoginToken || null
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function findBySessionId(sessionId) {
  const { data, error } = await supabase
    .from('signin_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findByUserId(userId) {
  const { data, error } = await supabase
    .from('signin_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function updateStatus(sessionId, status) {
  const { error } = await supabase
    .from('signin_sessions')
    .update({ status })
    .eq('session_id', sessionId);
  if (error) throw error;
}

async function findWithFilter(filter = {}) {
  let query = supabase.from('signin_sessions').select('*');
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.createdAtGte) query = query.gte('created_at', filter.createdAtGte);
  if (filter.createdAtLte) query = query.lte('created_at', filter.createdAtLte);
  query = query.order('created_at', { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

module.exports = { create, findBySessionId, findByUserId, updateStatus, findWithFilter };
