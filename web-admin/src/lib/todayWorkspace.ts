import type { DailyTask } from '@/services/dailyFlowService';
import { preparationTraysRemaining } from '@/services/workerTasks';
import { isHarvestAction } from '@/lib/taskActions';

export const todayGroups = [
  { id: 'attention', title: 'Needs attention' },
  { id: 'seed', title: 'Seed & prepare' },
  { id: 'water', title: 'Check & water' },
  { id: 'tend', title: 'Move & tend' },
  { id: 'harvest', title: 'Harvest & orders' },
] as const;
export type TodayGroup = typeof todayGroups[number]['id'];

export function isPreparationTask(task: DailyTask): boolean {
  return task.taskSource === 'seed_request' || task.taskSource === 'soak_request'
    || /^(seed|soak|prepare)(?:\s|$)/i.test(task.action.trim());
}

export function taskTrayCount(task: DailyTask): number {
  if (isPreparationTask(task)) return preparationTraysRemaining(task);
  const count = task.taskSource === 'order_fulfillment'
    ? task.traysNeeded ?? task.trays
    : task.traysRemaining ?? task.trays;
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

export function taskGroup(task: DailyTask): TodayGroup {
  if (task.isOverdue || task.missedSteps?.length || task.status === 'urgent'
    || (task.taskSource === 'order_fulfillment' && task.traysReady !== undefined
      && task.traysReady < taskTrayCount(task))) return 'attention';
  if (isPreparationTask(task)) return 'seed';
  if (/water/i.test(task.action)) return 'water';
  if (isHarvestAction(task.action) || task.taskSource === 'order_fulfillment') return 'harvest';
  return 'tend';
}

export function taskPurpose(task: DailyTask): string | null {
  const source = task.sourceType?.toLowerCase().replace(/[ -]/g, '_');
  if (task.standingOrderId || source === 'standing_order') {
    return task.customerName ? `Standing order · ${task.customerName}` : 'Standing order';
  }
  if (task.customerName) return `Customer · ${task.customerName}`;
  if (source === 'market' || source === 'farmers_market') return 'Market';
  if (source === 'extra' || source === 'extras' || source === 'extra_inventory') return 'Extra inventory';
  return null;
}

function purposePriority(task: DailyTask): number {
  const purpose = taskPurpose(task);
  if (purpose?.startsWith('Standing order')) return 0;
  if (purpose?.startsWith('Customer')) return 1;
  if (purpose === 'Market') return 2;
  if (purpose === 'Extra inventory') return 4;
  return 3;
}

export function groupTodayTasks(tasks: DailyTask[]) {
  const active = tasks.filter(task => taskTrayCount(task) > 0);
  return todayGroups.map(group => ({
    ...group,
    tasks: active.filter(task => taskGroup(task) === group.id).sort((a, b) =>
      purposePriority(a) - purposePriority(b)
      || (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0)
      || a.crop.localeCompare(b.crop)
      || a.id.localeCompare(b.id)),
  }));
}

export function taskWorkLabel(task: DailyTask): string {
  return /water/i.test(task.action) ? 'Check & water as needed' : task.action;
}
