import { getSupabaseClient } from '../lib/supabaseClient';

export interface OrderFulfillmentStatus {
  delivery_date: string;
  harvest_date: string;
  sow_date: string;
  customer_name: string;
  recipe_name: string;
  recipe_id: number;
  trays_needed: number;
  farm_uuid: string;
  standing_order_id: number;
  trays_ready: number;
  fulfillment_status: 'fulfilled' | 'partial' | 'no_trays';
}

export interface OrderFulfillmentSummary {
  delivery_date: string;
  farm_uuid: string;
  customer_name: string;
  total_items: number;
  total_trays_needed: number;
  total_trays_ready: number;
  items_fulfilled: number;
  items_partial: number;
  items_no_trays: number;
  items_at_risk: number;
  items_plantable: number;
  order_status: 'ready' | 'at_risk' | 'plantable';
}

export async function fetchOrderFulfillmentSummary(
  farmUuid: string,
  startDate: string,
  endDate: string
): Promise<OrderFulfillmentSummary[]> {
  const { data, error } = await getSupabaseClient()
    .from('order_fulfillment_summary')
    .select('*')
    .eq('farm_uuid', farmUuid)
    .gte('delivery_date', startDate)
    .lte('delivery_date', endDate)
    .order('delivery_date');

  if (error) throw error;
  return data || [];
}

export async function fetchOrderFulfillmentDetails(
  farmUuid: string,
  deliveryDate: string,
  customerName: string
): Promise<OrderFulfillmentStatus[]> {
  const { data, error } = await getSupabaseClient()
    .from('order_fulfillment_status')
    .select('*')
    .eq('farm_uuid', farmUuid)
    .eq('delivery_date', deliveryDate)
    .eq('customer_name', customerName);

  if (error) throw error;
  return data || [];
}

export async function getSowDateForOrder(
  farmUuid: string,
  recipeId: number,
  deliveryDate: string
): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from('planting_schedule_view')
    .select('sow_date')
    .eq('farm_uuid', farmUuid)
    .eq('recipe_id', recipeId)
    .eq('delivery_date', deliveryDate)
    .single();

  if (error) return null;
  return data?.sow_date || null;
}




