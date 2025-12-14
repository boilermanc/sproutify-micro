import { supabase } from '../lib/supabaseClient';
import type { OrderFulfillmentStatus } from './orderFulfillmentService';

export type FulfillmentActionType = 'skipped' | 'substituted' | 'contacted' | 'partial' | 'log';

export interface FulfillmentAction {
  action_id: number;
  farm_uuid: string;
  standing_order_id: number | null;
  delivery_date: string;
  recipe_id: number;
  action_type: FulfillmentActionType;
  action_reason: string | null;
  original_quantity: number | null;
  fulfilled_quantity: number | null;
  substitute_recipe_id: number | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export async function recordFulfillmentAction(
  farmUuid: string,
  item: OrderFulfillmentStatus,
  actionType: FulfillmentActionType,
  details: {
    reason?: string;
    notes?: string;
    substituteRecipeId?: number;
    fulfilledQuantity?: number;
    userId?: string;
  }
): Promise<void> {
  const { error } = await supabase.from('order_fulfillment_actions').insert({
    farm_uuid: farmUuid,
    standing_order_id: item.standing_order_id,
    delivery_date: item.delivery_date,
    recipe_id: item.recipe_id,
    action_type: actionType,
    action_reason: details.reason || null,
    original_quantity: item.trays_needed,
    fulfilled_quantity: details.fulfilledQuantity || 0,
    substitute_recipe_id: details.substituteRecipeId || null,
    notes: details.notes || null,
    created_by: details.userId || null,
  });

  if (error) throw error;
}

export async function getItemAction(
  farmUuid: string,
  deliveryDate: string,
  recipeId: number
): Promise<FulfillmentAction | null> {
  const { data, error } = await supabase
    .from('order_fulfillment_actions')
    .select('*')
    .eq('farm_uuid', farmUuid)
    .eq('delivery_date', deliveryDate)
    .eq('recipe_id', recipeId)
    .maybeSingle();

  if (error && (error as any).code !== 'PGRST116') throw error;
  return data as FulfillmentAction | null;
}
