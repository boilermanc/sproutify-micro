import { beforeEach, expect, it, vi } from 'vitest';
import { fetchGrowingGroups, fetchOutstandingPlantingRequests, mergePlantingTasks, groupGrowingTrays, plantingPlan, tasksForGrowingGroup, type GrowingTray, type GrowingStep } from './growingWorkspace';
import type { DailyTask } from './dailyFlowService';

const fixture = vi.hoisted(() => ({ failTable: '', filters: [] as Array<[string, unknown]>, rows: {} as Record<string, unknown[]> }));
vi.mock('@/lib/supabaseClient', () => ({ getSupabaseClient: () => ({ from: (table: string) => {
  let start = 0; let end = Infinity;
  const chain = { select: () => chain, eq: (key: string, value: unknown) => { fixture.filters.push([key, value]); return chain; }, is: () => chain, or: () => chain, order: () => chain, in: () => chain, range: (from: number, to: number) => { start = from; end = to; fixture.filters.push(['range', [from, to]]); return chain; },
    then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: (fixture.rows[table] || []).slice(start, end + 1), error: fixture.failTable === table ? new Error('Database read failed') : null }).then(resolve) };
  return chain;
} }) }));
const tray = (id: number, overrides: Partial<GrowingTray> = {}): GrowingTray => ({ tray_id: id, recipe_id: 42, sow_date: '2026-10-18', location: 'Rack A', status: 'active', recipes: { recipe_name: 'Radish' }, ...overrides });
const definitions = [{ step_id: 1, step_name: 'Seed', sequence_order: 1 }, { step_id: 2, step_name: 'Grow', sequence_order: 2 }, { step_id: 3, step_name: 'Harvest', sequence_order: 3 }];
const finished = (trayId: number, stepId = 1): GrowingStep => ({ tray_id: trayId, step_id: stepId, scheduled_date: '2026-10-18', status: 'Completed' });
beforeEach(() => { fixture.failTable = ''; fixture.filters = []; fixture.rows = {}; localStorage.setItem('sproutify_session', JSON.stringify({ farmUuid: 'qa-farm' })); });

it('keeps distinct seed dates, locations, recipes and recorded stages in separate groups', () => {
  const groups = groupGrowingTrays([tray(1), tray(2), tray(3, { sow_date: '2026-10-17' }), tray(4, { location: 'Rack B' }), tray(5), tray(6, { recipe_id: 43 })], [finished(1), finished(2), finished(3), finished(4), finished(5, 2), finished(6)], definitions);
  expect(groups).toHaveLength(5);
  expect(groups.find(group => group.trayIds.includes(1))?.trayIds).toEqual([1, 2]);
  expect(groups.find(group => group.trayIds.includes(5))?.stage).toBe('Grow');
});
it('hides harvested and lost trays while retaining legacy null-status active trays', () => {
  const groups = groupGrowingTrays([tray(1), tray(2, { status: 'lost' }), tray(3, { status: 'harvested' }), tray(4, { harvest_date: '2026-10-18' }), tray(5, { status: null })], [], []);
  expect(groups[0].trayIds).toEqual([1, 5]);
});
it('does not invent a stage or observed readiness from crop age or future harvest dates', () => {
  const groups = groupGrowingTrays([tray(1, { customer_id: 7, standing_order_id: 8 })], [{ tray_id: 1, step_id: 3, scheduled_date: '2026-10-25', status: 'Pending' }], definitions, [{ customerid: 7, name: 'Cafe' }]);
  expect(groups[0].stage).toBe('Stage not recorded');
  expect(groups[0].members[0]).toMatchObject({ estimatedHarvest: '2026-10-25', customerName: 'Cafe', standing_order_id: 8 });
});
it('uses remaining trays after partial seeding and excludes complete requests', () => {
  const tasks = [{ id: 'partial', action: 'Seed', crop: 'Radish', taskSource: 'seed_request', trays: 4, quantity: 4, quantityCompleted: 3 }, { id: 'done', action: 'Seed', crop: 'Radish', taskSource: 'seed_request', trays: 4, traysRemaining: 0 }, { id: 'soak', action: 'Soak', crop: 'Radish', taskSource: 'soak_request', trays: 2 }, { id: 'care', action: 'Water', crop: 'Radish', taskSource: 'tray_step', trays: 3 }] as DailyTask[];
  expect(plantingPlan(tasks).map(task => task.id)).toEqual(['partial', 'soak']);
});
it('uses the same known commitment priority as Today without inferring an unassigned purpose', () => {
  const base = { action: 'Seed', crop: 'Radish', taskSource: 'seed_request', trays: 1, status: 'pending' };
  const tasks = [
    { ...base, id: 'extra', sourceType: 'extra_inventory' },
    { ...base, id: 'unknown' },
    { ...base, id: 'market', sourceType: 'market' },
    { ...base, id: 'standing', standingOrderId: 7, customerName: 'Cafe' },
  ] as DailyTask[];
  expect(plantingPlan(tasks).map(task => task.id)).toEqual(['standing', 'market', 'unknown', 'extra']);
  expect(tasks[1].sourceType).toBeUndefined();
});
it('scopes harvest work and missed-step IDs to the selected group without losing task identity', () => {
  const group = groupGrowingTrays([tray(1), tray(2)], [], [])[0];
  const task = { id: 'harvest-7', recipeId: 42, taskSource: 'tray_step', stepId: 3, requestId: 99, trayIds: [1, 2, 90], trays: 3, trayDetails: [{ trayId: 1 }, { trayId: 90 }], missedSteps: [{ stepId: 2, trayIds: [2, 90] }] } as DailyTask;
  const scoped = tasksForGrowingGroup(group, [task])[0];
  expect(scoped).toMatchObject({ id: 'harvest-7', stepId: 3, requestId: 99, trayIds: [1, 2], trays: 2, traysRemaining: 2, trayDetails: [{ trayId: 1 }], missedSteps: [{ stepId: 2, trayIds: [2] }] });
  expect(task.trayIds).toEqual([1, 2, 90]);
});
it('does not narrow recipe-wide watering to one crop group', () => {
  const group = groupGrowingTrays([tray(1)], [], [])[0];
  expect(tasksForGrowingGroup(group, [{ taskSource: 'tray_step', action: 'Water', trayIds: [1, 90], trays: 2 } as DailyTask])).toEqual([]);
});
it.each(['trays', 'tray_steps', 'steps', 'customers'])('propagates %s read errors rather than returning empty success', async table => {
  fixture.rows = { trays: [tray(1, { customer_id: 7 })], tray_steps: [finished(1)], steps: definitions, customers: [{ customerid: 7, name: 'Cafe' }] };
  fixture.failTable = table;
  await expect(fetchGrowingGroups()).rejects.toThrow('Database read failed');
});
it('farm-scopes active crop and tray-history reads', async () => {
  fixture.rows = { trays: [tray(1)], tray_steps: [finished(1)], steps: definitions };
  expect(await fetchGrowingGroups()).toHaveLength(1);
  expect(fixture.filters.filter(([key]) => key === 'farm_uuid')).toEqual([['farm_uuid', 'qa-farm'], ['farm_uuid', 'qa-farm']]);
});
it('includes future partial requests with real source and customer identities, excluding closed and completed rows', async () => {
  const base = { request_id: 99, recipe_id: 42, recipe_name: 'Pea recipe', variety_name: 'Pea', seed_date: '2026-10-25', quantity: 4, quantity_completed: 1, status: 'approved', source_type: 'standing_order', customer_name: 'Cafe', customer_id: 7, standing_order_id: 8 };
  fixture.rows.tray_creation_requests = [base, { ...base, request_id: 100, status: 'cancelled' }, { ...base, request_id: 101, quantity_completed: 4 }];
  const tasks = await fetchOutstandingPlantingRequests(new Date(2026, 9, 18));
  expect(tasks).toEqual([expect.objectContaining({ requestId: 99, recipeId: 42, taskSource: 'seed_request', action: 'Seed', trays: 3, traysRemaining: 3, quantity: 4, quantityCompleted: 1, sowDate: '2026-10-25', status: 'pending', isOverdue: false, sourceType: 'standing_order', customerName: 'Cafe', customerId: 7, standingOrderId: 8 })]);
  expect(fixture.filters).toContainEqual(['farm_uuid', 'qa-farm']);
});
it('merges a due seed request once while retaining worker identity, fresh quantity and separate soaking work', () => {
  const due = { id: 'worker-99', requestId: 99, taskSource: 'seed_request', trays: 4 } as DailyTask;
  const soak = { id: 'soak-99', requestId: 99, taskSource: 'soak_request', trays: 2 } as DailyTask;
  const request = { ...due, id: 'planned-99', trays: 1, traysRemaining: 1, quantity: 4, quantityCompleted: 3 };
  const future = { ...request, id: 'future-100', requestId: 100 };
  expect(mergePlantingTasks([due, due, soak], [request, future])).toEqual([{ ...request, id: 'worker-99' }, soak, future]);
});
it('loads subsequent request pages without a date cutoff and marks actual overdue work', async () => {
  fixture.rows.tray_creation_requests = Array.from({ length: 501 }, (_, index) => ({ request_id: index + 1, recipe_id: 42, quantity: 2, quantity_completed: 1, status: 'in_progress', seed_date: '2026-10-17' }));
  const tasks = await fetchOutstandingPlantingRequests(new Date(2026, 9, 18));
  expect(tasks).toHaveLength(501);
  expect(tasks[500]).toMatchObject({ status: 'urgent', daysOverdue: 1, isOverdue: true });
  expect(fixture.filters).toContainEqual(['range', [500, 999]]);
});
it('fails closed when the outstanding planting read fails', async () => {
  fixture.failTable = 'tray_creation_requests';
  await expect(fetchOutstandingPlantingRequests()).rejects.toThrow('Database read failed');
});
it('keeps legacy soaked requests waiting for actual seeding', async () => {
  fixture.rows.tray_creation_requests = [{ request_id: 102, recipe_id: 42, quantity: 4, quantity_completed: 1, status: 'soaked', seed_date: '2026-10-18' }];
  expect(await fetchOutstandingPlantingRequests(new Date(2026, 9, 18))).toEqual([expect.objectContaining({ requestId: 102, traysRemaining: 3, taskSource: 'seed_request' })]);
});
