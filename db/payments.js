const { supabase } = require('../config/supabaseClient');

async function create(payment) {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      session_id: payment.sessionId,
      order_id: payment.orderId,
      amount: payment.amount,
      gateway_order_id: payment.gatewayOrderId,
      gateway_payment_id: payment.gatewayPaymentId || null,
      status: payment.status || 'created',
      paid_at: payment.paidAt || null
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function findByGatewayOrderId(gatewayOrderId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('gateway_order_id', gatewayOrderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findBySessionId(sessionId, status = null) {
  let query = supabase.from('payments').select('*').eq('session_id', sessionId);
  if (status) query = query.eq('status', status);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function updateById(id, fields) {
  const mapped = {};
  if (fields.status !== undefined) mapped.status = fields.status;
  if (fields.gatewayPaymentId !== undefined) mapped.gateway_payment_id = fields.gatewayPaymentId;
  if (fields.paidAt !== undefined) mapped.paid_at = fields.paidAt;

  const { data, error } = await supabase
    .from('payments')
    .update(mapped)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function findAll() {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('paid_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

async function findRecentPaid(limit = 5) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function sumRevenueToday(startOfDay, endOfDay) {
  const { data, error } = await supabase
    .from('payments')
    .select('amount')
    .eq('status', 'paid')
    .gte('paid_at', startOfDay)
    .lte('paid_at', endOfDay);
  if (error) throw error;
  return (data || []).reduce((sum, r) => sum + (r.amount || 0), 0);
}

module.exports = {
  create, findByGatewayOrderId, findBySessionId,
  updateById, findAll, findRecentPaid, sumRevenueToday
};
