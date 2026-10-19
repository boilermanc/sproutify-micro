import { getSupabaseClient } from '@/lib/supabaseClient';
import { localDateString } from '@/lib/dateUtils';
import { canManageFarm } from '@/lib/workspaceNavigation';

export interface TodayOrderSummary {
  id: number;
  customer: string;
  itemsSummary: string;
  status: string;
}
interface OrderRecord {
  order_id: number;
  status: string | null;
  customers: { name: string | null } | null;
  order_items: Array<{ quantity: number; products: { product_name: string | null } | null;
    product_variants: { variant_name: string | null } | null }>;
}

/** Read only, using the same order relationships as Orders. RLS still applies. */
export async function fetchTodayOrders(date = new Date()): Promise<TodayOrderSummary[]> {
  const session = JSON.parse(localStorage.getItem('sproutify_session') || '{}');
  if (!session.farmUuid || !canManageFarm(session.role)) throw new Error('Order access is unavailable.');
  const client = getSupabaseClient();
  const result: TodayOrderSummary[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.from('orders')
      .select('order_id,status,customers(name),order_items(quantity,products(product_name),product_variants(variant_name))')
      .eq('farm_uuid', session.farmUuid).eq('delivery_date', localDateString(date))
      .order('order_id').range(offset, offset + 99);
    if (error || !Array.isArray(data)) throw new Error('Today’s orders could not be loaded.');
    const page = data as unknown as OrderRecord[];
    result.push(...page.map(order => ({
      id: order.order_id,
      customer: order.customers?.name || 'Customer not recorded',
      status: order.status || 'Status not recorded',
      itemsSummary: order.order_items.map(item => `${item.products?.product_name || 'Product not recorded'}${item.product_variants?.variant_name ? ` (${item.product_variants.variant_name})` : ''} × ${item.quantity}`).join(' · ') || 'Items not recorded',
    })));
    if (page.length < 100) break;
  }
  return result;
}
