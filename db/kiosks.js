const { supabase } = require('../config/supabaseClient');

// ── Kiosks ──

async function findAll() {
  const { data, error } = await supabase
    .from('kiosks')
    .select('*')
    .order('kiosk_id');
  if (error) throw error;
  return data;
}

async function findOne(kioskId) {
  const { data, error } = await supabase
    .from('kiosks')
    .select('*')
    .eq('kiosk_id', kioskId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function upsert(kioskId, fields) {
  const { data, error } = await supabase
    .from('kiosks')
    .upsert({ kiosk_id: kioskId, ...fields }, { onConflict: 'kiosk_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateStatus(kioskId, status) {
  const { error } = await supabase
    .from('kiosks')
    .update({ status, last_seen: new Date().toISOString() })
    .eq('kiosk_id', kioskId);
  if (error) throw error;
}

module.exports = { findAll, findOne, upsert, updateStatus };
