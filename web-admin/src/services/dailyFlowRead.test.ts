import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fetchDailyTasks } from './dailyFlowService';
import { fetchWorkerTasks } from './workerTasks';

const state = vi.hoisted(() => ({
  errorTable: '', errorFields: '',
  rows: {} as Record<string, Array<Record<string, unknown>>>,
}));
vi.mock('../lib/supabaseClient', () => ({ getSupabaseClient: () => ({
  from: (table: string) => {
    let fields = '';
    const chain: object = new Proxy({}, { get: (_target, key) => {
      if (key === 'then') return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve({
        data: state.rows[table] || [],
        error: table === state.errorTable && (!state.errorFields || fields.includes(state.errorFields)) ? new Error(`${table} read failed`) : null,
      }).then(resolve, reject);
      if (key === 'select') return (value: string) => { fields = value; return chain; };
      return () => chain;
    } });
    return chain;
  },
}) }));

beforeEach(() => {
  localStorage.setItem('sproutify_session', JSON.stringify({ farmUuid: 'qa-farm', userId: 'qa-user' }));
  state.errorTable = ''; state.errorFields = ''; state.rows = {};
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
const date = new Date(2026, 9, 18, 12);
const strictRead = () => fetchDailyTasks(date, true, undefined, { strict: true });

it('rejects a failed daily view in strict mode and preserves the legacy fallback', async () => {
  state.errorTable = 'daily_flow_aggregated';
  await expect(strictRead()).rejects.toThrow('daily_flow_aggregated read failed');
  await expect(fetchDailyTasks(date, true)).resolves.toEqual([]);
});

it('propagates strict daily view failures through the shared worker reader', async () => {
  state.errorTable = 'daily_flow_aggregated';
  await expect(fetchWorkerTasks(date)).rejects.toThrow('daily_flow_aggregated read failed');
});

it('rejects missing farm identity instead of reporting an empty farm', async () => {
  localStorage.removeItem('sproutify_session');
  await expect(strictRead()).rejects.toThrow('session is missing');
  await expect(fetchDailyTasks(date)).resolves.toEqual([]);
  localStorage.setItem('sproutify_session', '{}');
  await expect(strictRead()).rejects.toThrow('session has no farm');
});

it('does not hide a failed active-tray supplement', async () => {
  state.errorTable = 'trays';
  await expect(strictRead()).rejects.toThrow('trays read failed');
  await expect(fetchDailyTasks(date)).resolves.toEqual([]);
});

it('does not hide failed recipe steps needed to determine crop care', async () => {
  state.rows.trays = [{ tray_id: 1, recipe_id: 42, sow_date: '2026-10-17', recipes: { recipe_id: 42 } }];
  state.errorTable = 'steps';
  await expect(strictRead()).rejects.toThrow('steps read failed');
});

it('rejects failed maintenance and planting sources instead of returning a partial all-clear', async () => {
  state.errorTable = 'maintenance_tasks';
  await expect(strictRead()).rejects.toThrow('maintenance_tasks read failed');
  state.errorTable = 'planting_schedule_view';
  await expect(strictRead()).rejects.toThrow('planting_schedule_view read failed');
});

it('rejects a completion lookup failure so already finished work cannot be shown as due', async () => {
  state.errorTable = 'task_completions';
  await expect(strictRead()).rejects.toThrow('task_completions read failed');
});

it('does not hide a failed seeding request mapping when work exists', async () => {
  state.rows.daily_flow_aggregated = [{ task_source: 'seed_request', request_id: 12, recipe_id: 42, task_name: 'Seed', quantity: 2, trays_remaining: 2 }];
  state.errorTable = 'tray_creation_requests'; state.errorFields = 'recipe_id, request_id';
  await expect(strictRead()).rejects.toThrow('tray_creation_requests read failed');
});

it('retains optional order insights as optional while core reads succeed', async () => {
  state.errorTable = 'order_fulfillment_status';
  await expect(strictRead()).resolves.toEqual([]);
});
