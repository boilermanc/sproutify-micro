import { beforeEach, expect, it, vi } from 'vitest';
import { loadWorkSeedOptions } from './farmWorkActions';
import type { DailyTask } from '@/services/dailyFlowService';

const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), rows: [] as unknown[] }));
vi.mock('@/lib/supabaseClient', () => ({ getSupabaseClient: () => ({ from: mock.from, rpc: mock.rpc }) }));
const task: DailyTask = { id: 'seed', action: 'Seed', crop: 'Pea', recipeId: 1, requestId: 9, trays: 2, trayIds: [], batchId: '', location: '', dayCurrent: 0, dayTotal: 10, status: 'pending' };
const caps = { care: true, soak: true, seed: true };
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  localStorage.setItem('sproutify_session', JSON.stringify({ farmUuid: 'farm', userId: 'hand', role: 'Farm Hand' }));
  const chain = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), order: vi.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(mock.rows.shift()).then(resolve) };
  for (const method of [chain.select, chain.eq, chain.single, chain.order]) method.mockReturnValue(chain);
  mock.from.mockReturnValue(chain);
  mock.rows = [
    { data: { variety_id: 3, seed_quantity: 25, seed_quantity_unit: 'grams', seed_quantity_grams: 99 }, error: null },
    { data: { name: 'Pea', seed_quantity_grams: 120 }, error: null },
    { data: [{ batchid: 4, quantity: 40, unit: 'grams', lot_number: 'QA', is_active: false, status: 'depleted' }], error: null },
    { data: [{ batch_id: 4, quantity_grams: -40 }], error: null },
  ];
  mock.rpc.mockResolvedValue({ data: [{ request_id: 9, recipe_id: 1, quantity: 2, quantity_completed: 0, requires_soak: true, seed_date: '2026-10-18', soak_date: '2026-10-17', blocked_soaked_stock: false, available_soaked_trays: 1, available_soaked_grams: 25, seed_grams_per_tray: 25, batches: [{ batch_id: 4, available_soaked_grams: 25 }] }], error: null });
});
it('offers held stock after dry stock reaches zero and uses the backend canonical recipe weight', async () => {
  const options = await loadWorkSeedOptions(task, caps);
  expect(options).toEqual({ gramsPerTray: 25, requiresSoak: true, batches: [{ id: 4, label: 'Pea · QA', availableGrams: 25 }] });
});
it('uses ledger-adjusted dry stock for more soaking instead of reusing already held stock', async () => {
  expect((await loadWorkSeedOptions({ ...task, action: 'Soak' }, caps)).batches).toEqual([]);
});
it('excludes inactive dry batches even if they retain a purchased balance', async () => {
  mock.rows[3] = { data: [], error: null };
  expect((await loadWorkSeedOptions({ ...task, action: 'Soak' }, caps)).batches).toEqual([]);
});
it('fails closed when the preparation read fails', async () => {
  mock.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
  await expect(loadWorkSeedOptions(task, caps)).rejects.toThrow(/Prepared seed/);
});
it('rejects absent canonical weight instead of falling back to stale local recipe values', async () => {
  mock.rpc.mockResolvedValueOnce({ data: [], error: null });
  await expect(loadWorkSeedOptions(task, caps)).rejects.toThrow(/positive seed weight/);
});
it('keeps legacy partial or incompatible prepared stock behind an explicit reconciliation message', async () => {
  const response = await mock.rpc();
  mock.rpc.mockResolvedValueOnce({ ...response, data: [{ ...response.data[0], blocked_soaked_stock: true }] });
  await expect(loadWorkSeedOptions(task, caps)).rejects.toThrow(/reconcile this stock/);
});
