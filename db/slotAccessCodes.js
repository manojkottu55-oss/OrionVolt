const { supabase } = require('../config/supabaseClient');

/**
 * Create a new slot access code record
 */
async function create({ bookingId, kioskId, accessCode, validFrom, validUntil }) {
  const { data, error } = await supabase
    .from('slot_access_codes')
    .insert({
      booking_id:  bookingId,
      kiosk_id:    kioskId,
      access_code: accessCode,
      valid_from:  validFrom,
      valid_until: validUntil,
      status:      'unused'
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Find a code by booking ID
 */
async function findByBookingId(bookingId) {
  const { data, error } = await supabase
    .from('slot_access_codes')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Find a code by kiosk + access code string (for MQTT verification)
 */
async function findByKioskAndCode(kioskId, accessCode) {
  const { data, error } = await supabase
    .from('slot_access_codes')
    .select('*, slot_bookings(*)')
    .eq('kiosk_id', kioskId)
    .eq('access_code', accessCode)
    .eq('status', 'unused')
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Check if any UNUSED code exists for this kiosk with this code value
 */
async function codeExistsForKiosk(kioskId, accessCode) {
  const { data, error } = await supabase
    .from('slot_access_codes')
    .select('id')
    .eq('kiosk_id', kioskId)
    .eq('access_code', accessCode)
    .eq('status', 'unused')
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/**
 * Update code status ('used' or 'expired')
 */
async function updateStatus(id, status) {
  const { data, error } = await supabase
    .from('slot_access_codes')
    .update({ status })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Expire all unused codes for bookings whose valid_until has passed
 */
async function expireOldCodes() {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('slot_access_codes')
    .update({ status: 'expired' })
    .eq('status', 'unused')
    .lt('valid_until', now)
    .select();
  if (error) throw error;
  return data || [];
}

module.exports = {
  create,
  findByBookingId,
  findByKioskAndCode,
  codeExistsForKiosk,
  updateStatus,
  expireOldCodes
};
