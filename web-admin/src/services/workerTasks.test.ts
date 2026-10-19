import { beforeEach, expect, it, vi } from 'vitest';
import type { DailyTask } from './dailyFlowService';
import { fetchWorkerTasks, preparationTraysRemaining, seedBatchAvailableGrams } from './workerTasks';

const fixture = vi.hoisted(() => ({
  daily: [] as DailyTask[],
  overdue: [{ request_id: 779, task_date: '2026-10-17', quantity: 2, quantity_completed: 1, trays_remaining: 1, variety_name: 'Radish' }],
  requests: [{ request_id: 779, recipe_id: 42 }],
  fail: false,
  farmFilters: [] as string[],
}));
vi.mock('./dailyFlowService', () => ({fetchDailyTasks: async () => fixture.daily}));
vi.mock('@/lib/supabaseClient', () => ({getSupabaseClient: () => ({from: (table: string) => {
  const result = () => ({data: table === 'daily_flow_aggregated' ? fixture.overdue : fixture.requests, error: fixture.fail ? new Error('Read failed') : null});
  const chain = {
    select: () => chain,
    eq: (key: string, value: string) => {if (key === 'farm_uuid') fixture.farmFilters.push(value); return chain;},
    lt: () => chain, gt: () => chain, order: () => Promise.resolve(result()), in: () => Promise.resolve(result()),
  };
  return chain;
}})}));
beforeEach(() => {
  localStorage.setItem('sproutify_session', JSON.stringify({farmUuid:'qa-farm'}));
  fixture.daily=[];fixture.requests=[{request_id:779,recipe_id:42}];fixture.fail=false;fixture.farmFilters=[];
});
it('uses only the outstanding tray count after partial completion', () => {
  expect(preparationTraysRemaining({trays:2,quantity:2,quantityCompleted:1,traysRemaining:1})).toBe(1);
  expect(preparationTraysRemaining({trays:2,quantity:2,quantityCompleted:1})).toBe(1);
});
it('never turns a completed or over-completed request into another tray', () => {
  expect(preparationTraysRemaining({trays:2,traysRemaining:0})).toBe(0);
  expect(preparationTraysRemaining({trays:2,quantityCompleted:3})).toBe(0);
});
it('retains an unfinished prior-day seed request with its recipe and remaining quantity', async () => {
  const tasks=await fetchWorkerTasks(new Date(2026,9,18,9));
  expect(tasks).toEqual([expect.objectContaining({requestId:779,recipeId:42,trays:1,traysRemaining:1,isOverdue:true,daysOverdue:1,sowDate:'2026-10-17'})]);
  expect(fixture.farmFilters).toEqual(['qa-farm','qa-farm']);
});
it('does not duplicate a request already supplied by the daily view', async () => {
  fixture.daily=[{requestId:779,taskSource:'seed_request'} as DailyTask];
  expect(await fetchWorkerTasks(new Date(2026,9,18))).toHaveLength(1);
});
it('surfaces a failed backlog read instead of reporting no tasks', async () => {
  fixture.fail=true;
  await expect(fetchWorkerTasks()).rejects.toThrow('Read failed');
});
it('does not hide an outstanding request with an inaccessible recipe', async () => {
  fixture.requests=[];
  await expect(fetchWorkerTasks()).rejects.toThrow('no accessible recipe');
});
it('calculates available seed from purchase plus usage and correction transactions', () => {
  expect(seedBatchAvailableGrams(907.18,[{quantity_grams:'-20'}])).toBeCloseTo(887.18);
  expect(seedBatchAvailableGrams(100,[{quantity_grams:-40},{quantity_grams:'10'}])).toBe(70);
  expect(seedBatchAvailableGrams(10,[{quantity_grams:-20}])).toBe(0);
});
it('refuses malformed inventory instead of showing an available balance', () => {
  expect(()=>seedBatchAvailableGrams(10,[{quantity_grams:'invalid'}])).toThrow('could not be calculated');
});
it('uses declared purchase units without guessing from the numeric quantity', () => {
  expect(seedBatchAvailableGrams(1,[],'grams')).toBe(1);
  expect(seedBatchAvailableGrams(1,[{quantity_grams:-20}],'lbs')).toBeCloseTo(433.592);
  expect(seedBatchAvailableGrams(1,[],'kg')).toBe(1000);
  expect(seedBatchAvailableGrams(2,[],'oz')).toBeCloseTo(56.699);
  expect(()=>seedBatchAvailableGrams(1,[],'unknown')).toThrow('unsupported unit');
});
