const { supabase } = require('../config/supabaseClient');

async function create(booking) {
  const { data, error } = await supabase
    .from('slot_bookings')
    .insert({
      user_id: booking.userId,
      user_name: booking.userName,
      user_mobile: booking.userMobile,
      kiosk_id: booking.kioskId,
      kiosk_location: booking.kioskLocation,
      vehicle_model: booking.vehicleModel,
      booking_date: booking.bookingDate,
      booking_time: booking.bookingTime,
      duration_minutes: booking.durationMinutes,
      status: booking.status || 'upcoming'
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
  
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.kioskId) {
    query = query.eq('kiosk_id', filters.kioskId);
  }
  if (filters.date) {
    query = query.eq('booking_date', filters.date);
  }
  if (filters.userId) {
    query = query.eq('user_id', filters.userId);
  }

  query = query.order('booking_date', { ascending: true })
               .order('booking_time', { ascending: true });

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

module.exports = {
  create,
  findById,
  updateStatus,
  deleteBooking,
  findAll,
  findByKioskAndDate
};
