const { supabase } = require('../config/supabaseClient');

async function create(userId, vehicleData) {
  // Check if it's the first vehicle, if so make it default
  const { data: existing } = await supabase
    .from('user_vehicles')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  const isDefault = existing && existing.length > 0 ? vehicleData.isDefault || false : true;

  const { data, error } = await supabase
    .from('user_vehicles')
    .insert({
      user_id: userId,
      vehicle_type: vehicleData.vehicleType,
      vehicle_make: vehicleData.company,
      vehicle_model: vehicleData.vehicleId, // Storing ID or name? UI usually sends ID or name, storing model ID/name
      vehicle_registration_number: vehicleData.registrationNumber,
      is_default: isDefault
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function findByUserId(userId) {
  const { data, error } = await supabase
    .from('user_vehicles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function updateDefault(userId, vehicleId) {
  // Reset all user vehicles to not default
  const { error: resetErr } = await supabase
    .from('user_vehicles')
    .update({ is_default: false })
    .eq('user_id', userId);
  
  if (resetErr) throw resetErr;

  // Set the specific one to default
  const { data, error } = await supabase
    .from('user_vehicles')
    .update({ is_default: true })
    .eq('id', vehicleId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function remove(userId, vehicleId) {
  const { error } = await supabase
    .from('user_vehicles')
    .delete()
    .eq('id', vehicleId)
    .eq('user_id', userId);

  if (error) throw error;
  return true;
}

module.exports = {
  create,
  findByUserId,
  updateDefault,
  remove
};
