import type { DailyTask } from '@/services/dailyFlowService';
import type { GrowingGroup } from '@/services/growingWorkspace';
import { isHarvestAction } from './taskActions';
import { taskTrayCount } from './todayWorkspace';

export type DashboardStage = 'blackout' | 'lights' | 'harvest' | 'other';
export interface StageTotals { blackout: number; lights: number; harvest: number; other: number }
export type ReadState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

function recordedStage(value: string): DashboardStage {
  const stage = value.trim().toLowerCase();
  if (/^(blackout|germination)$/.test(stage)) return 'blackout';
  if (/^(grow|growing|lights|under lights|filtered light|light)$/.test(stage)) return 'lights';
  return 'other';
}

export function harvestTasks(tasks: DailyTask[]): DailyTask[] {
  return tasks.filter(task => isHarvestAction(task.action) && taskTrayCount(task) > 0);
}

/** Count physical active trays once. Conflicting history remains unclassified. */
export function dashboardStageTotals(groups: GrowingGroup[], tasks: DailyTask[]): StageTotals {
  const stages = new Map<number, DashboardStage>();
  for (const group of groups) {
    const members = new Map(group.members.map(member => [member.tray_id, member]));
    for (const id of group.trayIds) {
      const member = members.get(id);
      if (!member || member.harvest_date || (member.status && member.status.toLowerCase() !== 'active')) continue;
      const stage = recordedStage(member.recordedStage);
      stages.set(id, stages.has(id) && stages.get(id) !== stage ? 'other' : stage);
    }
  }
  for (const task of harvestTasks(tasks)) {
    for (const id of task.trayIds) if (stages.has(id)) stages.set(id, 'harvest');
  }
  const totals: StageTotals = { blackout: 0, lights: 0, harvest: 0, other: 0 };
  for (const stage of stages.values()) totals[stage]++;
  return totals;
}

export function dashboardTaskKind(task: DailyTask): string {
  const action = task.action.toLowerCase();
  if (isHarvestAction(action)) return 'harvest';
  if (/seed|sow|prepare/.test(action)) return 'seed';
  if (/soak/.test(action)) return 'soak';
  if (/water|mist/.test(action)) return 'water';
  if (/uncover|light/.test(action)) return 'uncover';
  if (/pack/.test(action)) return 'pack';
  return 'tend';
}
