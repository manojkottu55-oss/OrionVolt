const { supabase } = require('../config/supabaseClient');

async function create(refund) {
  const { data, error } = await supabase
    .from('refunds')
    .insert({
      session_id: refund.sessionId,
      payment_id: refund.paymentId || null,
      amount_refunded: refund.amountRefunded,
      reason: refund.reason,
      status: refund.status || 'pending',
      processed_at: refund.processedAt || null
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function findAll() {
  const { data, error } = await supabase
    .from('refunds')
    .select('*')
    .order('processed_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

async function sumRefundsToday(startOfDay, endOfDay) {
  const { data, error } = await supabase
    .from('refunds')
    .select('amount_refunded')
    .eq('status', 'processed')
    .gte('processed_at', startOfDay)
    .lte('processed_at', endOfDay);
  if (error) throw error;
  return (data || []).reduce((sum, r) => sum + (r.amount_refunded || 0), 0);
}

module.exports = { create, findAll, sumRefundsToday };
