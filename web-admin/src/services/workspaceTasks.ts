import type { DailyTask } from './dailyFlowService';
import { fetchWorkerTasks } from './workerTasks';
import {
  fetchGrowingGroups, fetchOutstandingPlantingRequests, mergePlantingTasks,
  tasksForGrowingGroup, type GrowingGroup,
} from './growingWorkspace';
import {
  getFarmWorkCapabilities, fetchCareChecks, fetchPreparationStatus, listPendingFarmWork,
  type FarmWorkCapabilities, type PreparationStatus,
} from './farmWorkBackend';
import { localDateString } from '@/lib/dateUtils';

const carePrefix = 'farm-care:';
export const isWorkspaceCareTask = (task: DailyTask): boolean => task.id.startsWith(carePrefix);
const calendarDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

// A response can be lost after the server commits. Keep the original review
// reachable even when fresh progress/history has removed its ordinary task.
export function withPendingWorkspaceTasks(tasks: DailyTask[], pending: Array<{context?: {task: DailyTask}}>): DailyTask[] {
  const merged = new Map(tasks.map(task => [task.id, task]));
  for (const operation of pending) {
    if (operation.context) merged.set(operation.context.task.id, { ...operation.context.task, status: 'urgent' });
  }
  return [...merged.values()];
}
interface WorkspaceInputs {
  tasks: DailyTask[];
  groups: GrowingGroup[];
  requests: DailyTask[];
  capabilities: FarmWorkCapabilities;
  checks?: Array<{ tray_id: number; watered: boolean }>;
  preparation?: PreparationStatus[];
  date?: Date;
  todayOnly?: boolean;
}

/** New history is authoritative only when its matching backend capability exists. */
export function mergeWorkspaceTasks({ tasks, groups, requests, capabilities, checks = [], preparation = [], date = new Date(), todayOnly = false }: WorkspaceInputs): DailyTask[] {
  let merged = capabilities.soak ? mergePlantingTasks(tasks, requests) : [...tasks];
  const today = localDateString(date);
  if (capabilities.care) {
    if (checks.some(check => !Number.isInteger(check.tray_id) || check.tray_id <= 0 || typeof check.watered !== 'boolean')) throw new Error('Crop checks could not be verified. Refresh before recording care.');
    const checked = new Set(checks.map(check => check.tray_id));
    // A check-only record still completes today's inspection. It does not claim watering.
    merged = merged.filter(task => !/water|mist/i.test(task.action));
    for (const group of groups) {
      const trayIds = [...new Set(group.trayIds.filter(id => !checked.has(id)))];
      if (!trayIds.length) continue;
      merged.push({
        id: `${carePrefix}${group.id}`, action: 'Water', crop: group.crop,
        recipeId: group.recipeId, location: group.location, trayIds,
        trays: trayIds.length, traysRemaining: trayIds.length,
        batchId: 'N/A', dayCurrent: 0, dayTotal: 0, status: 'pending', taskSource: 'tray_step',
        sowDate: group.seededDate || undefined,
        trayDetails: group.members.filter(member => trayIds.includes(member.tray_id)).map(member => ({
          trayId: member.tray_id, varietyName: group.crop, sowDate: member.sow_date || undefined,
        })),
      });
    }
  }
  if (capabilities.soak) {
    const status = new Map(preparation.map(row => [row.request_id, row]));
    const checkedStatus = (request: DailyTask): PreparationStatus => {
      const row = request.requestId === undefined ? undefined : status.get(request.requestId);
      if (!row) throw new Error('Prepared seed status is missing for a planting request. Refresh before recording work.');
      if (row.recipe_id !== request.recipeId || typeof row.requires_soak !== 'boolean'
        || !calendarDate(row.seed_date) || (row.requires_soak && !calendarDate(row.soak_date))
        || !Number.isInteger(row.quantity) || row.quantity < 0 || !Number.isInteger(row.quantity_completed) || row.quantity_completed < 0 || row.quantity_completed > row.quantity
        || !Number.isInteger(row.available_soaked_trays) || row.available_soaked_trays < 0) throw new Error('Prepared seed quantities could not be verified. Refresh before recording work.');
      return row;
    };
    const legacySoaks = new Map(tasks.filter(task => task.taskSource === 'soak_request' && task.requestId !== undefined).map(task => [task.requestId, task]));
    // Recipe/day completions cannot hide remaining request-specific preparation.
    merged = merged.filter(task => task.taskSource !== 'soak_request');
    merged = merged.map(task => {
      if (task.taskSource !== 'seed_request') return task;
      const row = checkedStatus(task);
      const remaining = Math.max(0, row.quantity - row.quantity_completed);
      const overdue = row.seed_date < today;
      return { ...task, quantity: row.quantity, quantityCompleted: row.quantity_completed, trays: remaining, traysRemaining: remaining,
        sowDate: row.seed_date, isOverdue: overdue, daysOverdue: overdue ? Math.round((Date.parse(today) - Date.parse(row.seed_date)) / 86400000) : 0,
        status: row.blocked_soaked_stock || overdue ? 'urgent' as const : 'pending' as const,
        ...(row.blocked_soaked_stock ? { stepDescription: 'Prepared seed needs stock review before more work can be recorded.' } : {}),
      };
    });
    for (const request of requests) {
      if (request.requestId === undefined) throw new Error('A planting request has no preparation identity.');
      const row = checkedStatus(request);
      if (!row.requires_soak) continue;
      const remaining = Math.max(0, row.quantity - row.quantity_completed - row.available_soaked_trays);
      if (!remaining && !row.blocked_soaked_stock) continue;
      const legacy = legacySoaks.get(request.requestId);
      const soakDate = row.soak_date!;
      const overdue = soakDate < today;
      const count = remaining || Math.max(0, row.quantity - row.quantity_completed);
      merged.push({
        ...legacy, ...request, id: `farm-soak:${request.requestId}`, action: 'Soak', taskSource: 'soak_request',
        quantity: row.quantity, quantityCompleted: row.quantity_completed, trays: count, traysRemaining: count,
        sowDate: soakDate, isOverdue: overdue, daysOverdue: overdue ? Math.round((Date.parse(today) - Date.parse(soakDate)) / 86400000) : 0,
        status: row.blocked_soaked_stock || overdue ? 'urgent' : 'pending',
        ...(row.blocked_soaked_stock ? { stepDescription: 'Prepared seed needs stock review before more work can be recorded.' } : {}),
      });
    }
  }
  return todayOnly ? merged.filter(task => !['seed_request', 'soak_request'].includes(task.taskSource || '') || !task.sowDate || task.sowDate.slice(0, 10) <= today) : merged;
}

/** Only per-tray care can safely narrow a water task to a selected crop group. */
export function workspaceTasksForGrowingGroup(group: GrowingGroup, tasks: DailyTask[]): DailyTask[] {
  const legacy = tasksForGrowingGroup(group, tasks.filter(task => !isWorkspaceCareTask(task)));
  const ids = new Set(group.trayIds);
  const care = tasks.filter(isWorkspaceCareTask).flatMap(task => {
    const trayIds = task.trayIds.filter(id => ids.has(id));
    return trayIds.length ? [{ ...task, trayIds, trays: trayIds.length, traysRemaining: trayIds.length, location: group.location,
      trayDetails: task.trayDetails?.filter(tray => ids.has(tray.trayId)),
    }] : [];
  });
  return [...legacy, ...care];
}

/** One refresh shares expensive reads without retaining data across farms or saves. */
export function createTodayWorkspaceReads() {
  const capabilities = getFarmWorkCapabilities();
  let groups: Promise<GrowingGroup[]> | undefined;
  let preparation: Promise<PreparationStatus[]> | undefined;
  return {
    capabilities,
    groups: () => groups ??= fetchGrowingGroups(),
    preparation: () => preparation ??= fetchPreparationStatus(),
  };
}
export type TodayWorkspaceReads = ReturnType<typeof createTodayWorkspaceReads>;

export async function fetchTodayWorkspaceTasks(date = new Date(), reads = createTodayWorkspaceReads()): Promise<DailyTask[]> {
  const capabilities = await reads.capabilities;
  const [tasks, groups, requests, checks, preparation] = await Promise.all([
    fetchWorkerTasks(date),
    capabilities.care ? reads.groups() : Promise.resolve([]),
    capabilities.soak ? fetchOutstandingPlantingRequests(date) : Promise.resolve([]),
    capabilities.care ? fetchCareChecks(date) : Promise.resolve([]),
    capabilities.soak ? reads.preparation() : Promise.resolve([]),
  ]);
  return withPendingWorkspaceTasks(mergeWorkspaceTasks({ tasks, groups, requests, checks, preparation, capabilities, date, todayOnly: true }), listPendingFarmWork());
}

export async function fetchGrowingWorkspace(date = new Date()): Promise<{groups: GrowingGroup[]; tasks: DailyTask[]}> {
  const capabilities = await getFarmWorkCapabilities();
  const [groups, tasks, requests, checks, preparation] = await Promise.all([
    fetchGrowingGroups(), fetchWorkerTasks(date), fetchOutstandingPlantingRequests(date),
    capabilities.care ? fetchCareChecks(date) : Promise.resolve([]),
    capabilities.soak ? fetchPreparationStatus() : Promise.resolve([]),
  ]);
  const legacy = mergePlantingTasks(tasks, requests);
  return { groups, tasks: withPendingWorkspaceTasks(mergeWorkspaceTasks({ tasks: legacy, groups, requests, checks, preparation, capabilities, date }), listPendingFarmWork()) };
}
