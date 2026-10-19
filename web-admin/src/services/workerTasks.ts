import { getSupabaseClient } from '@/lib/supabaseClient';
import { localDateString } from '@/lib/dateUtils';
import { fetchDailyTasks, type DailyTask } from './dailyFlowService';

export function preparationTraysRemaining(task: Pick<DailyTask, 'traysRemaining' | 'quantity' | 'quantityCompleted' | 'trays'>): number {
  return Math.max(0, task.traysRemaining ?? ((task.quantity ?? task.trays) - (task.quantityCompleted ?? 0)));
}

export function seedBatchAvailableGrams(purchased: number, transactions: Array<{quantity_grams: number | string}>, unit = 'grams'): number {
  const factors: Record<string, number> = { g:1, gram:1, grams:1, kg:1000, lb:453.592, lbs:453.592, oz:28.3495 };
  const factor = factors[unit.toLowerCase()];
  if (!factor) throw new Error('Seed inventory has an unsupported unit');
  const available = purchased * factor + transactions.reduce((sum, row) => sum + Number(row.quantity_grams), 0);
  if (!Number.isFinite(available)) throw new Error('Seed inventory could not be calculated');
  return Math.max(0, available);
}

// The worker has no calendar navigation: outstanding seed requests must survive midnight.
export async function fetchWorkerTasks(date = new Date()): Promise<DailyTask[]> {
  const tasks = [...await fetchDailyTasks(date, true, undefined, { strict: true })];
  const stored = localStorage.getItem('sproutify_session');
  if (!stored) return tasks;
  const { farmUuid } = JSON.parse(stored);
  if (!farmUuid) return tasks;
  const today = localDateString(date);
  const client = getSupabaseClient();
  const { data: overdue, error } = await client.from('daily_flow_aggregated')
    .select('*').eq('farm_uuid', farmUuid).eq('task_source', 'seed_request')
    .lt('task_date', today).gt('trays_remaining', 0).order('task_date');
  if (error) throw error;
  if (!overdue?.length) return tasks;
  const ids = overdue.map(row => row.request_id).filter((id): id is number => typeof id === 'number');
  if (!ids.length) return tasks;
  const { data: requests, error: requestError } = await client.from('tray_creation_requests')
    .select('request_id, recipe_id').eq('farm_uuid', farmUuid).in('request_id', ids);
  if (requestError) throw requestError;
  const recipes = new Map((requests ?? []).map(row => [row.request_id, row.recipe_id]));
  const existing = new Set(tasks.filter(task => task.taskSource === 'seed_request').map(task => task.requestId));
  for (const row of overdue) {
    const recipeId = recipes.get(row.request_id);
    if (existing.has(row.request_id)) continue;
    if (!recipeId) throw new Error('An outstanding seed request has no accessible recipe');
    tasks.push({
      id: `overdue-seed-${row.request_id}`, action: 'Seed',
      crop: row.variety_name || row.recipe_name || 'Unknown', batchId: 'N/A', location: 'Not set',
      dayCurrent: 0, dayTotal: 0, trays: row.trays_remaining, traysRemaining: row.trays_remaining,
      quantity: row.quantity, quantityCompleted: row.quantity_completed, status: 'urgent',
      trayIds: [], recipeId, requestId: row.request_id, taskSource: 'seed_request',
      customerName: row.customer_name || undefined, isOverdue: true,
      daysOverdue: Math.round((Date.parse(today) - Date.parse(row.task_date)) / 86400000),
      sowDate: row.task_date,
    });
    existing.add(row.request_id);
  }
  return tasks;
}
