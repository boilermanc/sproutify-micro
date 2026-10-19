import { getSupabaseClient } from '@/lib/supabaseClient';
import type { DailyTask } from './dailyFlowService';
import { preparationTraysRemaining } from './workerTasks';
import { groupTodayTasks } from '@/lib/todayWorkspace';
import { localDateString } from '@/lib/dateUtils';

export interface GrowingTray {
  tray_id: number;
  tray_unique_id?: string;
  recipe_id: number;
  sow_date: string | null;
  location: string | null;
  status?: string | null;
  harvest_date?: string | null;
  customer_id?: number | null;
  standing_order_id?: number | null;
  order_schedule_id?: number | null;
  recipes?: { recipe_name: string } | null;
}
export interface GrowingStep {
  tray_id: number;
  step_id: number;
  scheduled_date: string | null;
  completed_date?: string | null;
  completed_at?: string | null;
  completed?: boolean | null;
  skipped?: boolean | null;
  status?: string | null;
}
export interface StepDefinition { step_id: number; step_name: string; sequence_order: number }
export interface GrowingMember extends GrowingTray {
  recordedStage: string;
  nextStep: string | null;
  estimatedHarvest: string | null;
  customerName: string | null;
}
export interface GrowingGroup {
  id: string;
  recipeId: number;
  crop: string;
  seededDate: string | null;
  stage: string;
  location: string;
  trayIds: number[];
  members: GrowingMember[];
}

// Stage is historical evidence, not a prediction based on how old a crop is.
export function groupGrowingTrays(trays: GrowingTray[], records: GrowingStep[], definitions: StepDefinition[], customers: Array<{ customerid: number; name: string }> = []): GrowingGroup[] {
  const steps = new Map(definitions.map(step => [step.step_id, step]));
  const names = new Map(customers.map(customer => [customer.customerid, customer.name]));
  const grouped = new Map<string, GrowingGroup>();
  for (const tray of trays) {
    if (tray.harvest_date || (tray.status && tray.status.toLowerCase() !== 'active')) continue;
    const history = records.filter(record => record.tray_id === tray.tray_id && !record.skipped);
    const finished = history.filter(record => record.completed || record.status?.toLowerCase() === 'completed')
      .sort((a, b) => (b.completed_at ?? b.completed_date ?? '').localeCompare(a.completed_at ?? a.completed_date ?? '') || (steps.get(b.step_id)?.sequence_order ?? 0) - (steps.get(a.step_id)?.sequence_order ?? 0));
    const pending = history.filter(record => !record.completed && record.status?.toLowerCase() === 'pending')
      .sort((a, b) => (a.scheduled_date ?? '9999').localeCompare(b.scheduled_date ?? '9999') || (steps.get(a.step_id)?.sequence_order ?? 0) - (steps.get(b.step_id)?.sequence_order ?? 0));
    const stage = steps.get(finished[0]?.step_id)?.step_name ?? 'Stage not recorded';
    const member: GrowingMember = {
      ...tray, recordedStage: stage, nextStep: steps.get(pending[0]?.step_id)?.step_name ?? null,
      estimatedHarvest: pending.find(record => /harvest/i.test(steps.get(record.step_id)?.step_name ?? ''))?.scheduled_date ?? null,
      customerName: tray.customer_id ? names.get(tray.customer_id) ?? null : null,
    };
    const date = tray.sow_date?.slice(0, 10) ?? null;
    const location = tray.location?.trim() || 'Location not recorded';
    const key = JSON.stringify([tray.recipe_id, date, stage, location]);
    let group = grouped.get(key);
    if (!group) {
      group = { id: key, recipeId: tray.recipe_id, crop: tray.recipes?.recipe_name || `Recipe ${tray.recipe_id}`, seededDate: date, stage, location, trayIds: [], members: [] };
      grouped.set(key, group);
    }
    group.trayIds.push(tray.tray_id);
    group.members.push(member);
  }
  return [...grouped.values()].sort((a, b) => a.crop.localeCompare(b.crop) || (a.seededDate ?? '').localeCompare(b.seededDate ?? '') || a.location.localeCompare(b.location));
}

export function plantingPlan(tasks: DailyTask[]): DailyTask[] {
  const outstanding = tasks.filter(task => (task.taskSource === 'seed_request' || task.taskSource === 'soak_request') && preparationTraysRemaining(task) > 0);
  return groupTodayTasks(outstanding).flatMap(group => group.tasks);
}

export function mergePlantingTasks(tasks: DailyTask[], requests: DailyTask[]): DailyTask[] {
  const byRequest = new Map(requests.map(task => [task.requestId, task]));
  const seen = new Set<number>();
  const merged = tasks.flatMap(task => {
    if (task.taskSource !== 'seed_request' || task.requestId === undefined) return [task];
    if (seen.has(task.requestId)) return [];
    seen.add(task.requestId);
    const request = byRequest.get(task.requestId);
    if (!request) return [task];
    return [{ ...task, ...request, id: task.id }];
  });
  return [...merged, ...requests.filter(task => task.requestId === undefined || !seen.has(task.requestId))];
}

// Growing shows the whole planting backlog, including dates beyond Today.
export async function fetchOutstandingPlantingRequests(date = new Date()): Promise<DailyTask[]> {
  const stored = localStorage.getItem('sproutify_session');
  const farmUuid = stored ? JSON.parse(stored).farmUuid : null;
  if (!farmUuid) throw new Error('Your farm session is unavailable. Please sign in again.');
  const today = localDateString(date);
  const tasks: DailyTask[] = [];
  const client = getSupabaseClient();
  for (let offset = 0; ; offset += 500) {
    const result = await client.from('tray_creation_requests')
      .select('request_id,recipe_id,recipe_name,variety_name,quantity,quantity_completed,seed_date,status,source_type,customer_name,standing_order_id,customer_id')
      .eq('farm_uuid', farmUuid).in('status', ['pending', 'approved', 'in_progress', 'soaked']).order('request_id').range(offset, offset + 499);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    for (const row of page) {
      if (!['pending', 'approved', 'in_progress', 'soaked'].includes(row.status)) continue;
      const quantity = Number(row.quantity);
      const completed = Number(row.quantity_completed ?? 0);
      if (!Number.isFinite(quantity) || !Number.isFinite(completed)) throw new Error('An outstanding planting quantity could not be verified.');
      const remaining = Math.max(0, quantity - completed);
      if (!remaining) continue;
      if (!row.recipe_id || !row.request_id) throw new Error('An outstanding planting request has no accessible recipe or request identity.');
      const overdue = !!row.seed_date && row.seed_date < today;
      tasks.push({
        id: `planned-seed-${row.request_id}`, action: 'Seed', crop: row.variety_name || row.recipe_name || `Recipe ${row.recipe_id}`,
        batchId: 'N/A', location: 'Not set', dayCurrent: 0, dayTotal: 0,
        trays: remaining, traysRemaining: remaining, trayIds: [], recipeId: row.recipe_id,
        requestId: row.request_id, taskSource: 'seed_request', quantity, quantityCompleted: completed,
        status: overdue ? 'urgent' : 'pending', isOverdue: overdue,
        daysOverdue: overdue ? Math.round((Date.parse(today) - Date.parse(row.seed_date)) / 86400000) : 0,
        sowDate: row.seed_date || undefined, sourceType: row.source_type || undefined,
        customerName: row.customer_name || undefined, customerId: row.customer_id || undefined,
        standingOrderId: row.standing_order_id || undefined,
      });
    }
    if (page.length < 500) break;
  }
  return tasks;
}

// Never pass a recipe-wide task to a group action: whole trays stay the unit of work.
export function tasksForGrowingGroup(group: GrowingGroup, tasks: DailyTask[]): DailyTask[] {
  const members = new Set(group.trayIds);
  return tasks.filter(task => task.taskSource === 'tray_step' && task.trayIds.some(id => members.has(id)) &&
    // Watering is still persisted by recipe/day, so a narrowed group is unsafe.
    (!/water|mist/i.test(task.action) || (task.trayIds.every(id => members.has(id)) && new Set(task.trayIds).size === task.trays))).map(task => {
    const trayIds = [...new Set(task.trayIds.filter(id => members.has(id)))];
    return {
      ...task, location: group.location, trayIds, trays: trayIds.length, traysRemaining: trayIds.length,
      trayDetails: task.trayDetails?.filter(tray => members.has(tray.trayId)),
      missedSteps: task.missedSteps?.map(step => ({ ...step, trayIds: step.trayIds.filter(id => members.has(id)) })).filter(step => step.trayIds.length),
    };
  });
}

export async function fetchGrowingGroups(): Promise<GrowingGroup[]> {
  const stored = localStorage.getItem('sproutify_session');
  const farmUuid = stored ? JSON.parse(stored).farmUuid : null;
  if (!farmUuid) throw new Error('Your farm session is unavailable. Please sign in again.');
  const client = getSupabaseClient();
  const trays: GrowingTray[] = [];
  // Explicit pagination avoids silently hiding crops at the API's row limit.
  for (let offset = 0; ; offset += 500) {
    const result = await client.from('trays').select('tray_id,tray_unique_id,recipe_id,sow_date,location,status,harvest_date,customer_id,standing_order_id,order_schedule_id,recipes(recipe_name)')
      .eq('farm_uuid', farmUuid).is('harvest_date', null).or('status.is.null,status.eq.active').order('tray_id').range(offset, offset + 499);
    if (result.error) throw result.error;
    const page = (result.data ?? []) as unknown as GrowingTray[];
    trays.push(...page);
    if (page.length < 500) break;
  }
  if (!trays.length) return [];
  const records: GrowingStep[] = [];
  // A small tray chunk plus record pagination keeps large farms complete.
  for (let start = 0; start < trays.length; start += 100) {
    for (let offset = 0; ; offset += 500) {
      const result = await client.from('tray_steps').select('tray_id,step_id,scheduled_date,completed_date,completed_at,completed,skipped,status')
        .eq('farm_uuid', farmUuid).in('tray_id', trays.slice(start, start + 100).map(tray => tray.tray_id)).order('tray_step_id').range(offset, offset + 499);
      if (result.error) throw result.error;
      const page = (result.data ?? []) as GrowingStep[];
      records.push(...page);
      if (page.length < 500) break;
    }
  }
  const definitions: StepDefinition[] = [];
  const stepIds = [...new Set(records.map(record => record.step_id))];
  for (let start = 0; start < stepIds.length; start += 100) {
    const result = await client.from('steps').select('step_id,step_name,sequence_order').in('step_id', stepIds.slice(start, start + 100));
    if (result.error) throw result.error;
    definitions.push(...(result.data ?? []));
  }
  const customers: Array<{ customerid: number; name: string }> = [];
  const customerIds = [...new Set(trays.flatMap(tray => tray.customer_id ? [tray.customer_id] : []))];
  for (let start = 0; start < customerIds.length; start += 100) {
    const result = await client.from('customers').select('customerid,name').eq('farm_uuid', farmUuid).in('customerid', customerIds.slice(start, start + 100));
    if (result.error) throw result.error;
    customers.push(...(result.data ?? []));
  }
  return groupGrowingTrays(trays, records, definitions, customers);
}
