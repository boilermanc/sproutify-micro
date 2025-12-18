import { supabase } from '../lib/supabaseClient';

export type GeneratedSeedingRequest = {
  request_id: number;
  recipe_name: string;
  seed_date: string;
  quantity: number;
  customer_name: string;
};

export async function generateSeedingRequestsFromOrders(
  farmUuid: string,
  startDate: string,
  endDate: string
): Promise<GeneratedSeedingRequest[]> {
  const { data, error } = await supabase.rpc('generate_seeding_requests_from_orders', {
    p_farm_uuid: farmUuid,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) throw error;
  return (data as GeneratedSeedingRequest[]) || [];
}




