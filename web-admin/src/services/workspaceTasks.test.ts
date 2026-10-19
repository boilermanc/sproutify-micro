import { beforeEach, expect, it, vi } from 'vitest';
import type { DailyTask } from './dailyFlowService';
import type { GrowingGroup } from './growingWorkspace';
import type { PreparationStatus } from './farmWorkBackend';
import { createTodayWorkspaceReads, fetchTodayWorkspaceTasks, fetchGrowingWorkspace, mergeWorkspaceTasks, workspaceTasksForGrowingGroup, withPendingWorkspaceTasks } from './workspaceTasks';

const mocks = vi.hoisted(() => ({ tasks: vi.fn(), groups: vi.fn(), requests: vi.fn(), caps: vi.fn(), checks: vi.fn(), preparation: vi.fn(), pending: vi.fn() }));
vi.mock('./workerTasks', async importOriginal => ({ ...await importOriginal<typeof import('./workerTasks')>(), fetchWorkerTasks: mocks.tasks }));
vi.mock('./growingWorkspace', async importOriginal => ({ ...await importOriginal<typeof import('./growingWorkspace')>(), fetchGrowingGroups: mocks.groups, fetchOutstandingPlantingRequests: mocks.requests }));
vi.mock('./farmWorkBackend', () => ({ getFarmWorkCapabilities: mocks.caps, fetchCareChecks: mocks.checks, fetchPreparationStatus: mocks.preparation, listPendingFarmWork: mocks.pending }));

const date = new Date(2026, 9, 18, 12);
const capabilities = { care: true, soak: true, seed: true };
const group = (id: string, trayIds: number[], recipeId = 42): GrowingGroup => ({ id, trayIds, recipeId, crop: 'Pea', location: id, seededDate: '2026-10-10', stage: 'Grow', members: trayIds.map(tray_id => ({ tray_id, recipe_id: recipeId, sow_date: '2026-10-10', location: id, recordedStage: 'Grow', nextStep: null, estimatedHarvest: null, customerName: null })) });
const request = (id = 8, sowDate = '2026-10-18'): DailyTask => ({ id: `seed-${id}`, requestId: id, recipeId: 42, action: 'Seed', crop: 'Pea', batchId: 'N/A', location: 'Not set', trayIds: [], trays: 6, quantity: 6, quantityCompleted: 1, traysRemaining: 5, status: 'pending', dayCurrent: 0, dayTotal: 0, taskSource: 'seed_request', sowDate, sourceType: 'market', customerName: 'Cafe' });
const preparation = (overrides: Partial<PreparationStatus> = {}): PreparationStatus => ({ request_id: 8, recipe_id: 42, requires_soak: true, seed_date: '2026-10-18', soak_date: '2026-10-18', quantity: 6, quantity_completed: 1, available_soaked_trays: 2, available_soaked_grams: 40, seed_grams_per_tray: 20, batches: [{ batch_id: 1, available_soaked_grams: 40 }], ...overrides });
const merge = (overrides: Partial<Parameters<typeof mergeWorkspaceTasks>[0]> = {}) => mergeWorkspaceTasks({ tasks: [], groups: [], requests: [], capabilities, date, ...overrides });

beforeEach(() => { vi.clearAllMocks(); mocks.caps.mockResolvedValue({ care: false, soak: false, seed: false }); mocks.tasks.mockResolvedValue([]); mocks.groups.mockResolvedValue([]); mocks.requests.mockResolvedValue([]); mocks.checks.mockResolvedValue([]); mocks.preparation.mockResolvedValue([]); mocks.pending.mockReturnValue([]); });

it('shares growing and preparation reads within a refresh without caching across saves', async () => {
  mocks.caps.mockResolvedValue(capabilities);
  const reads = createTodayWorkspaceReads();
  await Promise.all([fetchTodayWorkspaceTasks(date, reads), reads.groups(), reads.preparation()]);
  expect(mocks.groups).toHaveBeenCalledTimes(1);
  expect(mocks.preparation).toHaveBeenCalledTimes(1);
  const refreshed = createTodayWorkspaceReads();
  await fetchTodayWorkspaceTasks(date, refreshed);
  expect(mocks.groups).toHaveBeenCalledTimes(2);
  expect(mocks.preparation).toHaveBeenCalledTimes(2);
});

it('builds care for every active crop group even if legacy recipe/day watering is absent or completed', () => {
  const groups = [group('Rack A', [1, 2]), group('Rack B', [3]), group('Rack C', [4], 99)];
  const tasks = merge({ groups, tasks: [{ ...request(), id: 'legacy-water', taskSource: 'tray_step', action: 'Water', trayIds: [1, 2, 3], trays: 3 }, { ...request(), id: 'legacy-mist', taskSource: 'tray_step', action: 'Mist', trayIds: [4], trays: 1 }] });
  expect(tasks.map(task => task.id)).toEqual(['farm-care:Rack A', 'farm-care:Rack B', 'farm-care:Rack C']);
  expect(tasks.map(task => task.trayIds)).toEqual([[1, 2], [3], [4]]);
});

it('check-only clears inspections for selected trays without claiming they were watered', () => {
  const checks = [{ tray_id: 1, watered: false }, { tray_id: 3, watered: true }];
  const tasks = merge({ groups: [group('A', [1, 2]), group('B', [3])], checks });
  expect(tasks).toHaveLength(1); expect(tasks[0].trayIds).toEqual([2]);
  expect(checks[0].watered).toBe(false);
  expect(merge({ groups: [group('A', [1])], checks })).toEqual([]);
});

it('permits narrowing only synthetic per-tray care; legacy recipe-wide water remains blocked', () => {
  const tasks = merge({ groups: [group('A', [1, 2, 3])] });
  const narrowed = workspaceTasksForGrowingGroup(group('A subset', [2]), tasks);
  expect(narrowed[0].trayIds).toEqual([2]); expect(narrowed[0].traysRemaining).toBe(1);
  expect(workspaceTasksForGrowingGroup(group('A subset', [2]), [{ ...tasks[0], id: 'legacy-water' }])).toEqual([]);
});

it('soaking counts seeded plus available held trays and preserves separate request identities and context', () => {
  const tasks = merge({ tasks: [{ ...request(), id: 'legacy-soak', action: 'Soak', taskSource: 'soak_request', traysRemaining: 6 }], requests: [request()], preparation: [preparation()] });
  expect(tasks.filter(task => task.taskSource === 'seed_request')).toHaveLength(1);
  const soak = tasks.find(task => task.taskSource === 'soak_request');
  expect(soak).toMatchObject({ id: 'farm-soak:8', requestId: 8, traysRemaining: 3, sourceType: 'market', customerName: 'Cafe' });
  expect(tasks.find(task => task.taskSource === 'seed_request')?.traysRemaining).toBe(5);
});

it('restores partial preparation hidden by legacy day completion and removes fully covered soaking', () => {
  expect(merge({ requests: [request()], preparation: [preparation()] }).find(task => task.taskSource === 'soak_request')?.trays).toBe(3);
  expect(merge({ requests: [request()], preparation: [preparation({ available_soaked_trays: 5 })] }).some(task => task.taskSource === 'soak_request')).toBe(false);
});

it('expired stock contributes no ready coverage and future requests remain only in Growing', () => {
  const future = request(8, '2026-10-20');
  const inputs = { requests: [future], preparation: [preparation({ seed_date: '2026-10-20', soak_date: '2026-10-20', available_soaked_trays: 0, available_soaked_grams: 0 })] };
  expect(merge(inputs).find(task => task.taskSource === 'soak_request')?.traysRemaining).toBe(5);
  expect(merge({ ...inputs, todayOnly: true })).toEqual([]);
});

it('caps false preserves legacy tasks and avoids all new care/preparation reads', async () => {
  const legacy = request(); mocks.tasks.mockResolvedValue([legacy]);
  expect(await fetchTodayWorkspaceTasks(date)).toEqual([legacy]);
  expect(mocks.groups).not.toHaveBeenCalled(); expect(mocks.requests).not.toHaveBeenCalled();
  const growing = await fetchGrowingWorkspace(date); expect(growing.tasks).toEqual([legacy]);
  expect(mocks.checks).not.toHaveBeenCalled(); expect(mocks.preparation).not.toHaveBeenCalled();
});

it('enabled reads supply authoritative tasks to both workspaces and keep future work off Today', async () => {
  mocks.caps.mockResolvedValue(capabilities); mocks.groups.mockResolvedValue([group('A', [1, 2])]);
  mocks.checks.mockResolvedValue([{ tray_id: 1, watered: false }]);
  mocks.requests.mockResolvedValue([request(8, '2026-10-20')]); mocks.preparation.mockResolvedValue([preparation({ seed_date: '2026-10-20', soak_date: '2026-10-20' })]);
  const today = await fetchTodayWorkspaceTasks(date); expect(today).toHaveLength(1); expect(today[0].trayIds).toEqual([2]);
  const growing = await fetchGrowingWorkspace(date); expect(growing.tasks.filter(task => task.requestId === 8)).toHaveLength(2);
});

it('read failures and missing preparation identity reject instead of presenting an empty all-clear', async () => {
  mocks.caps.mockResolvedValue(capabilities); mocks.checks.mockRejectedValue(new Error('Care unavailable'));
  await expect(fetchTodayWorkspaceTasks(date)).rejects.toThrow('Care unavailable');
  mocks.checks.mockResolvedValue([]); mocks.preparation.mockRejectedValue(new Error('Preparation unavailable'));
  await expect(fetchGrowingWorkspace(date)).rejects.toThrow('Preparation unavailable');
  expect(() => merge({ requests: [request()], preparation: [] })).toThrow('Prepared seed status is missing');
});
it('rejects malformed preparation and check history instead of hiding NaN or unchecked work', () => {
  expect(() => merge({ requests: [request()], preparation: [preparation({ quantity: NaN })] })).toThrow('quantities could not be verified');
  expect(() => merge({ requests: [request()], preparation: [preparation({ recipe_id: 99 })] })).toThrow('quantities could not be verified');
  expect(() => merge({ groups: [group('A', [1])], checks: [{ tray_id: 1, watered: undefined as unknown as boolean }] })).toThrow('checks could not be verified');
});
it('retains original ambiguous work after fresh progress removes it and replaces stale intent by ID', async () => {
  const original = request();
  expect(withPendingWorkspaceTasks([{ ...original, traysRemaining: 1 }], [{ context: { task: original } }])).toEqual([{ ...original, status: 'urgent' }]);
  mocks.pending.mockReturnValue([{ context: { task: original } }]);
  expect(await fetchTodayWorkspaceTasks(date)).toEqual([{ ...original, status: 'urgent' }]);
  expect((await fetchGrowingWorkspace(date)).tasks).toEqual([{ ...original, status: 'urgent' }]);
  expect(original.status).toBe('pending');
});
it('shows soaking due today while seeding tomorrow stays in Growing, with separate overdue dates', () => {
  const inputs = { requests: [request(8, '2026-10-19')], preparation: [preparation({ seed_date: '2026-10-19', soak_date: '2026-10-18' })] };
  const today = merge({ ...inputs, todayOnly: true });
  expect(today).toEqual([expect.objectContaining({ taskSource: 'soak_request', sowDate: '2026-10-18', isOverdue: false })]);
  expect(merge(inputs).map(task => task.taskSource)).toEqual(['seed_request', 'soak_request']);
  const overdue = merge({ ...inputs, preparation: [preparation({ seed_date: '2026-10-19', soak_date: '2026-10-17' })], todayOnly: true });
  expect(overdue[0]).toMatchObject({ status: 'urgent', isOverdue: true, daysOverdue: 1 });
});
it('keeps blocked preparation visible for stock review even when ready counts cover its plan', () => {
  const tasks = merge({ requests: [request()], preparation: [preparation({ available_soaked_trays: 5, blocked_soaked_stock: true })] });
  const soak = tasks.find(task => task.taskSource === 'soak_request');
  expect(soak).toMatchObject({ status: 'urgent', traysRemaining: 5, stepDescription: expect.stringContaining('stock review') });
  expect(tasks.find(task => task.taskSource === 'seed_request')?.stepDescription).toContain('stock review');
});
