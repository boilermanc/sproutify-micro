import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordFarmWork, workValidation, type SeedOptions, type WorkInput } from './farmWorkActions';
import { completeSeedTask, completeTask } from '@/services/dailyFlowService';
import type { DailyTask } from '@/services/dailyFlowService';

const mocks = vi.hoisted(() => ({ results: [] as unknown[], from: vi.fn() }));
vi.mock('@/lib/supabaseClient', () => ({ getSupabaseClient: () => ({ from: mocks.from }) }));
vi.mock('@/services/dailyFlowService', () => ({ completeTask: vi.fn(), completeSeedTask: vi.fn(), completeSoakTask: vi.fn() }));
vi.mock('@/services/workerTasks', () => ({ preparationTraysRemaining: (task: DailyTask) => task.traysRemaining ?? task.trays, seedBatchAvailableGrams: (quantity: number, transactions: Array<{ quantity_grams: number }>) => quantity + transactions.reduce((sum, row) => sum + row.quantity_grams, 0) }));

const task: DailyTask = { id: 'work', action: 'Harvest', crop: 'Pea', batchId: 'b1', location: 'Shelf A', dayCurrent: 9, dayTotal: 10, trays: 3, trayIds: [11, 12, 13], recipeId: 7, stepId: 9, status: 'pending' };
const input: WorkInput = { quantity: '2', batchId: '4', weight: '120', trayIds: [11, 13] };
const options: SeedOptions = { batches: [{ id: 4, label: 'Pea batch', availableGrams: 150 }], gramsPerTray: 60 };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('sproutify_session', JSON.stringify({ farmUuid: 'farm', userId: 'user', role: 'Owner' }));
  const chain = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), is: vi.fn(), neq: vi.fn(), single: vi.fn(), gt: vi.fn(), order: vi.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(mocks.results.shift()).then(resolve) };
  for (const method of [chain.select, chain.eq, chain.in, chain.is, chain.neq, chain.single, chain.gt, chain.order]) method.mockReturnValue(chain);
  mocks.from.mockReturnValue(chain);
  mocks.results = [];
});

describe('work quantities and selection', () => {
  it('accepts partial whole-tray seeding with sufficient seed inventory', () => {
    expect(workValidation({ ...task, action: 'Seed', requestId: 12, traysRemaining: 3 }, input, options)).toBeNull();
  });
  it.each(['0', '-1', '1.5', '4', 'Infinity', ''])('rejects invalid seed tray count %s', quantity => {
    expect(workValidation({ ...task, action: 'Seed', requestId: 12 }, { ...input, quantity }, options)).toMatch(/whole number/);
  });
  it('rejects depleted or mismatched batches and missing request contracts', () => {
    expect(workValidation({ ...task, action: 'Seed', requestId: 12 }, { ...input, quantity: '3' }, options)).toMatch(/enough seed/);
    expect(workValidation({ ...task, action: 'Seed', requestId: 12 }, { ...input, batchId: '99' }, options)).toMatch(/Choose/);
    expect(workValidation({ ...task, action: 'Seed' }, input, options)).toMatch(/no seeding request/);
  });
  it('allows selecting whole trays within a group and optional total harvest grams', () => {
    expect(workValidation(task, input, null)).toBeNull();
    expect(workValidation(task, { ...input, weight: '' }, null)).toBeNull();
    expect(workValidation(task, { ...input, trayIds: [999] }, null)).toMatch(/no longer part/);
    expect(workValidation(task, { ...input, trayIds: [11, 11] }, null)).toMatch(/no longer part/);
  });
  it.each(['0', '-3', 'Infinity', 'NaN'])('rejects invalid harvest grams %s', weight => {
    expect(workValidation(task, { ...input, weight }, null)).toMatch(/positive, finite/);
  });
  it('never sends partial watering or check-only work to the group backend', async () => {
    await expect(recordFarmWork({ ...task, action: 'Water' }, input, null)).rejects.toThrow(/Partial watering/);
    await expect(recordFarmWork({ ...task, action: 'Water' }, { ...input, trayIds: [] }, null)).rejects.toThrow(/Check-only/);
    expect(completeTask).not.toHaveBeenCalled();
  });
  it('requires a verified recipe step for ordinary task completion', () => {
    expect(workValidation({ ...task, action: 'Move to light', stepId: undefined }, input, null)).toMatch(/verified recipe step/);
  });
  it('keeps unsafe legacy soaking writes closed in the new shared workflow', async () => {
    await expect(recordFarmWork({ ...task, action: 'Soak', requestId: 12 }, input, options)).rejects.toThrow(/inventory and completion/);
    expect(completeTask).not.toHaveBeenCalled();
  });
});

it('harvests only selected whole trays and uses selected count for per-tray yield', async () => {
  mocks.results = [
    { data: [11, 13].map(tray_id => ({ tray_id, status: 'growing', harvest_date: null })), error: null },
    { data: [11, 13].map(tray_id => ({ tray_id, status: 'harvested', harvest_date: '2026-10-18', yield: 60 })), error: null },
    { data: [11, 13].map(tray_id => ({ tray_id, completed: true, status: 'Completed' })), error: null },
  ];
  vi.mocked(completeTask).mockResolvedValue(true);
  await recordFarmWork(task, input, null);
  expect(completeTask).toHaveBeenCalledWith(expect.objectContaining({ trayIds: [11, 13], trays: 2 }), 120, undefined, expect.any(String));
});

it('does not report a zero-row or already harvested write as success', async () => {
  mocks.results = [{ data: [], error: null }];
  await expect(recordFarmWork(task, input, null)).rejects.toThrow(/cannot be harvested/);
  expect(completeTask).not.toHaveBeenCalled();
});

it('blocks a narrowed watering group even when its displayed count was adjusted', async () => {
  mocks.results = [{ data: [{ tray_id: 11 }, { tray_id: 12 }, { tray_id: 13 }], error: null }];
  await expect(recordFarmWork({ ...task, action: 'Water', trays: 2, trayIds: [11, 13] }, input, null)).rejects.toThrow(/does not cover that whole crop/);
  expect(completeTask).not.toHaveBeenCalled();
});

it('treats false completion and failed harvest readback as reconciliation failures', async () => {
  mocks.results = [{ data: [11, 13].map(tray_id => ({ tray_id, status: 'growing' })), error: null }];
  vi.mocked(completeTask).mockResolvedValue(false);
  await expect(recordFarmWork(task, input, null)).rejects.toThrow(/not confirmed/);
  vi.mocked(completeTask).mockResolvedValue(true);
  mocks.results = [{ data: [11, 13].map(tray_id => ({ tray_id, status: 'growing' })), error: null }, { data: [], error: null }];
  await expect(recordFarmWork(task, input, null)).rejects.toThrow(/could not be reconciled/);
});

it('rejects nonnumeric harvest yield readback instead of accepting NaN comparison', async () => {
  vi.mocked(completeTask).mockResolvedValue(true);
  mocks.results = [
    { data: [11, 13].map(tray_id => ({ tray_id, status: 'growing' })), error: null },
    { data: [11, 13].map(tray_id => ({ tray_id, status: 'harvested', harvest_date: '2026-10-18', yield: 'NaN' })), error: null },
  ];
  await expect(recordFarmWork(task, input, null)).rejects.toThrow(/could not be reconciled/);
});

it('sends partial seeding through the verified existing wrapper after fresh inventory checks', async () => {
  mocks.results = [
    { data: { variety_id: 7, seed_quantity_grams: 60 }, error: null },
    { data: { name: 'Pea', seed_quantity_grams: 60 }, error: null },
    { data: [{ batchid: 4, quantity: 200, unit: 'grams', lot_number: 'Lot A' }], error: null },
    { data: [{ batch_id: 4, quantity_grams: -50 }], error: null },
  ];
  vi.mocked(completeSeedTask).mockResolvedValue(2);
  await recordFarmWork({ ...task, action: 'Seed', requestId: 15 }, input, options);
  expect(completeSeedTask).toHaveBeenCalledWith(15, 2, 4, undefined, 7, expect.any(String));
});

it('blocks a stale inventory shortage before invoking the seed write', async () => {
  mocks.results = [
    { data: { variety_id: 7, seed_quantity_grams: 60 }, error: null },
    { data: { name: 'Pea', seed_quantity_grams: 60 }, error: null },
    { data: [{ batchid: 4, quantity: 100, unit: 'grams' }], error: null },
    { data: [], error: null },
  ];
  await expect(recordFarmWork({ ...task, action: 'Seed', requestId: 15 }, input, options)).rejects.toThrow(/enough seed/);
  expect(completeSeedTask).not.toHaveBeenCalled();
});

it('keeps Farm Hand seeding closed until backend permissions are released', async () => {
  localStorage.setItem('sproutify_session', JSON.stringify({ farmUuid: 'farm', userId: 'hand', role: 'FarmHand' }));
  await expect(recordFarmWork({ ...task, action: 'Seed', requestId: 15 }, input, options)).rejects.toThrow(/Ask an owner/);
  expect(completeSeedTask).not.toHaveBeenCalled();
});
