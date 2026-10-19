import { beforeEach, expect, it, vi } from 'vitest';
import { fetchTodayOrders } from './todayDashboard';

const mocks = vi.hoisted(() => ({ from: vi.fn(), eq: vi.fn(), range: vi.fn() }));
vi.mock('@/lib/supabaseClient', () => ({ getSupabaseClient: () => ({ from: mocks.from }) }));
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('sproutify_session', JSON.stringify({ role: 'Owner', farmUuid: 'farm-a' }));
  const query = { select: vi.fn().mockReturnThis(), eq: mocks.eq.mockReturnThis(), order: vi.fn().mockReturnThis(), range: mocks.range };
  mocks.from.mockReturnValue(query);
  mocks.range.mockResolvedValue({ data: [], error: null });
});
it('filters orders by farm and the local delivery day, preserving actual statuses', async () => {
  mocks.range.mockResolvedValueOnce({ data: [{ order_id: 4, status: 'In Progress', customers: { name: 'Cafe' }, order_items: [{ quantity: 2, products: { product_name: 'Radish' }, product_variants: { variant_name: 'Large' } }] }], error: null });
  expect(await fetchTodayOrders(new Date(2026, 9, 18, 23, 59))).toEqual([{ id: 4, customer: 'Cafe', status: 'In Progress', itemsSummary: 'Radish (Large) × 2' }]);
  expect(mocks.eq).toHaveBeenCalledWith('farm_uuid', 'farm-a');
  expect(mocks.eq).toHaveBeenCalledWith('delivery_date', '2026-10-18');
});
it.each(['FarmHand', 'Farm Hand', 'Viewer'])('does not query orders for %s', async role => {
  localStorage.setItem('sproutify_session', JSON.stringify({ role, farmUuid: 'farm-a' }));
  await expect(fetchTodayOrders()).rejects.toThrow('Order access');
  expect(mocks.from).not.toHaveBeenCalled();
});
it('does not turn a backend error or missing response into an empty list', async () => {
  mocks.range.mockResolvedValueOnce({ data: null, error: new Error('Denied') });
  await expect(fetchTodayOrders()).rejects.toThrow('could not be loaded');
});
it('paginates large delivery days and labels missing fields honestly', async () => {
  const row = { order_id: 1, status: null, customers: null, order_items: [] };
  mocks.range.mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, index) => ({ ...row, order_id: index + 1 })), error: null })
    .mockResolvedValueOnce({ data: [{ ...row, order_id: 101 }], error: null });
  const orders = await fetchTodayOrders();
  expect(orders).toHaveLength(101);
  expect(orders[100]).toEqual({ id: 101, customer: 'Customer not recorded', status: 'Status not recorded', itemsSummary: 'Items not recorded' });
  expect(mocks.range).toHaveBeenLastCalledWith(100, 199);
});
