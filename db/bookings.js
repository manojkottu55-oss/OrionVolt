const { supabase } = require('../config/supabaseClient');

// ─── EXISTING FUNCTIONS (unchanged) ───────────────────────────────────────────

async function create(booking) {
  const { data, error } = await supabase
    .from('slot_bookings')
    .insert({
      user_id:          booking.userId,
      user_name:        booking.userName,
      user_mobile:      booking.userMobile,
      kiosk_id:         booking.kioskId,
      kiosk_location:   booking.kioskLocation,
      vehicle_model:    booking.vehicleModel,
      booking_date:     booking.bookingDate,
      booking_time:     booking.bookingTime,
      duration_minutes: booking.durationMinutes,
      status:           booking.status || 'upcoming'
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function findById(id) {
  const { data, error } = await supabase
    .from('slot_bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function updateStatus(id, status) {
  const { data, error } = await supabase
    .from('slot_bookings')
    .update({ status })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteBooking(id) {
  const { error } = await supabase
    .from('slot_bookings')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

async function findAll(filters = {}) {
  let query = supabase.from('slot_bookings').select('*');
  
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.kioskId) query = query.eq('kiosk_id', filters.kioskId);
  if (filters.date) query = query.eq('booking_date', filters.date);
  if (filters.userId) query = query.eq('user_id', filters.userId);

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function findByKioskAndDate(kioskId, date) {
  const { data, error } = await supabase
    .from('slot_bookings')
    .select('*')
    .eq('kiosk_id', kioskId)
    .eq('booking_date', date)
    .in('status', ['upcoming', 'completed'])
    .order('booking_time', { ascending: true });
  if (error) throw error;
  return data;
}

// ─── NEW FUNCTIONS FOR REBUILD ─────────────────────────────────────────────────

/**
 * Create a new slot booking with full calculated fields
 */
async function createSlotBooking(booking) {
  const { data, error } = await supabase
    .from('slot_bookings')
    .insert({
      user_id:                 booking.userId,
      user_name:               booking.userName,
      user_mobile:             booking.userMobile,
      kiosk_id:                booking.kioskId,
      kiosk_location:          booking.kioskLocation,
      vehicle_model:           booking.vehicleModel,
      vehicle_id:              booking.vehicleId,
      charging_mode:           booking.chargingMode,
      target_energy_kwh:       booking.targetEnergyKwh,
      estimated_amount:        booking.estimatedAmount,
      estimated_soc_gain:      booking.estimatedSocGain,
      estimated_time_minutes:  booking.estimatedTimeMinutes,
      slot_duration_minutes:   booking.slotDurationMinutes,
      booking_fee:             booking.bookingFee,
      total_payable:           booking.totalPayable,
      arrival_time:            booking.arrivalTime,
      slot_end_time:           booking.slotEndTime,
      // Legacy fields for backward compatibility
      booking_date:            booking.bookingDate,
      booking_time:            booking.bookingTime,
      duration_minutes:        booking.slotDurationMinutes,
      status:                  'pending_payment'
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Check for overlapping confirmed/pending bookings on a kiosk
 * Returns any conflicting booking or null
 */
async function checkOverlap(kioskId, startTs, endTs) {
  // A booking overlaps if: existing.arrival_time < newEnd AND existing.slot_end_time > newStart
  const { data, error } = await supabase
    .from('slot_bookings')
    .select('id, arrival_time, slot_end_time, status')
    .eq('kiosk_id', kioskId)
    .in('status', ['pending_payment', 'confirmed', 'active_unlocked', 'charging'])
    .lt('arrival_time', endTs)
    .gt('slot_end_time', startTs)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data; // null if no conflict
}

/**
 * Find any active booking for a kiosk at the current moment
 * (used by guest mode lock check in Task 10)
 */
async function findActiveBookingForKiosk(kioskId, now) {
  const { data, error } = await supabase
    .from('slot_bookings')
    .select('id, status, arrival_time, slot_end_time')
    .eq('kiosk_id', kioskId)
    .in('status', ['confirmed', 'active_unlocked', 'charging'])
    .lte('arrival_time', now)
    .gte('slot_end_time', now)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Update booking with access code and set status to 'confirmed'
 */
async function confirmWithCode(id, accessCode) {
  const { data, error } = await supabase
    .from('slot_bookings')
    .update({ status: 'confirmed', access_code: accessCode })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Find all expired confirmed bookings for no-show handling
 */
async function findExpiredConfirmed() {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('slot_bookings')
    .select('id, kiosk_id')
    .in('status', ['confirmed', 'pending_payment'])
    .lt('slot_end_time', now);
  if (error) throw error;
  return data || [];
}

/**
 * Bulk update statuses (used by expiry service)
 */
async function bulkUpdateStatus(ids, status) {
  if (!ids || ids.length === 0) return;
  const { error } = await supabase
    .from('slot_bookings')
    .update({ status })
    .in('id', ids);
  if (error) throw error;
}

module.exports = {
  // Existing
  create,
  findById,
  updateStatus,
  deleteBooking,
  findAll,
  findByKioskAndDate,
  // New
  createSlotBooking,
  checkOverlap,
  findActiveBookingForKiosk,
  confirmWithCode,
  findExpiredConfirmed,
  bulkUpdateStatus
};
