import { getSupabaseClient } from '../lib/supabaseClient';

// Action types match the database function parameter names
// Note: 'skip' maps to 'skipped' status, 'substitute' maps to 'substituted' status in order_schedules
export type FulfillmentActionType = 'skip' | 'substitute' | 'contacted' | 'partial' | 'note';

export interface FulfillmentAction {
  action_id: number;
  farm_uuid: string;
  standing_order_id: number | null;
  delivery_date: string;
  recipe_id: number;
  action_type: FulfillmentActionType; // 'contacted' | 'note' | 'skip' | 'partial' | 'substitute'
  action_reason: string | null;
  original_quantity: number | null;
  fulfilled_quantity: number | null;
  substitute_recipe_id: number | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface RecordActionResponse {
  success: boolean;
  action_id: number;
  schedule_id: number | null;
  resolved: boolean;
}

export interface RecordActionParams {
  p_farm_uuid: string;
  p_standing_order_id: number;
  p_delivery_date: string;
  p_recipe_id: number;
  p_action_type: FulfillmentActionType;
  p_notes?: string | null;
  p_original_quantity?: number | null;
  p_fulfilled_quantity?: number | null;
  p_substitute_recipe_id?: number | null;
  p_created_by?: string | null;
}

/**
 * Record a fulfillment action using the database RPC function.
 * This handles both logging to order_fulfillment_actions and
 * inserting into order_schedules for resolving actions.
 */
export async function recordFulfillmentAction(
  params: RecordActionParams
): Promise<RecordActionResponse> {
  const { data, error } = await getSupabaseClient().rpc('record_fulfillment_action', params);

  if (error) throw error;
  
  return data as RecordActionResponse;
}

export async function getItemAction(
  farmUuid: string,
  deliveryDate: string,
  recipeId: number
): Promise<FulfillmentAction | null> {
  const { data, error } = await getSupabaseClient()
    .from('order_fulfillment_actions')
    .select('*')
    .eq('farm_uuid', farmUuid)
    .eq('delivery_date', deliveryDate)
    .eq('recipe_id', recipeId)
    .maybeSingle();

  if (error && (error as any).code !== 'PGRST116') throw error;
  return data as FulfillmentAction | null;
}




