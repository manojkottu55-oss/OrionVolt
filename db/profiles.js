const { supabase } = require('../config/supabaseClient');

/**
 * Find or create a profile linked to a Supabase Auth user.
 * Called after auth operations to ensure a profiles row exists.
 */
async function findOrCreate(userId, fields = {}) {
  // Try to find existing profile
  const { data: existing, error: findErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing;

  // Create new profile
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      mobile_number: fields.mobileNumber || null,
      google_id: fields.googleId || null,
      name: fields.name || null,
      email: fields.email || null
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function findById(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function update(userId, fields) {
  const updateData = {};
  if (fields.name !== undefined) updateData.name = fields.name;
  if (fields.mobileNumber !== undefined) updateData.mobile_number = fields.mobileNumber;
  if (fields.profileCompleted !== undefined) updateData.profile_completed = fields.profileCompleted;
  
  const { data, error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = { findOrCreate, findById, update };
