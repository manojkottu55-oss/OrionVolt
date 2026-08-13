const { supabase } = require('../config/supabaseClient');

// Create a new ticket (user-facing)
async function create(ticketData) {
  const { data, error } = await supabase
    .from('support_tickets')
    .insert(ticketData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── ADMIN QUERIES ──

// List tickets with optional filters
async function findAll({ status, subject, search } = {}) {
  let query = supabase
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }
  if (subject && subject !== 'all') {
    query = query.eq('subject', subject);
  }
  if (search) {
    // Full-text search across name, email, message
    query = query.or(
      `name.ilike.%${search}%,email.ilike.%${search}%,message.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Get single ticket
async function findById(id) {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// Update ticket status
async function updateStatus(id, status) {
  const { data, error } = await supabase
    .from('support_tickets')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Save admin notes
async function updateNotes(id, admin_notes) {
  const { data, error } = await supabase
    .from('support_tickets')
    .update({ admin_notes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get open tickets count
async function countOpen() {
  const { count, error } = await supabase
    .from('support_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open');

  if (error) return 0;
  return count || 0;
}

module.exports = {
  create,
  findAll,
  findById,
  updateStatus,
  updateNotes,
  countOpen
};
