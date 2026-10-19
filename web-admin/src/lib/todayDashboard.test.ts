import { expect, it } from 'vitest';
import { dashboardStageTotals } from './todayDashboard';
import type { GrowingGroup } from '@/services/growingWorkspace';
import type { DailyTask } from '@/services/dailyFlowService';

const group = (stage: string, trayIds: number[]): GrowingGroup => ({
  id: stage, recipeId: 1, crop: 'Pea', seededDate: null, stage, location: 'R1', trayIds,
  members: trayIds.map(tray_id => ({ tray_id, recipe_id: 1, sow_date: null, location: 'R1', recordedStage: stage, nextStep: null, estimatedHarvest: null, customerName: null })),
});
const harvest: DailyTask = { id: 'h1', action: 'Harvest', crop: 'Pea', recipeId: 1, batchId: 'N/A', location: 'R1', dayCurrent: 8, dayTotal: 8, trays: 3, trayIds: [2, 3, 99], status: 'pending' };

it('deduplicates active trays and excludes harvest-due trays from their previous buckets', () => {
  const groups = [group('Blackout', [1, 1, 2]), group('Growing', [3, 4]), group('Growing', [4])];
  expect(dashboardStageTotals(groups, [harvest, { ...harvest, id: 'h2' }])).toEqual({ blackout: 1, lights: 1, harvest: 2, other: 0 });
});
it('retains unknown and conflicting recorded stages without predicting readiness', () => {
  expect(dashboardStageTotals([group('Germination', [1]), group('Filtered Light', [2]), group('Custom step', [3]), group('Blackout', [4]), group('Grow', [4])], [])).toEqual({ blackout: 1, lights: 1, harvest: 0, other: 2 });
});
it('excludes harvested/inactive trays and does not treat order demand as physical harvest work', () => {
  const value = group('Grow', [1, 2, 3]);
  value.members[0].harvest_date = '2026-10-18';
  value.members[1].status = 'lost';
  expect(dashboardStageTotals([value], [{ ...harvest, action: 'Pack', taskSource: 'order_fulfillment', trayIds: [3] }])).toEqual({ blackout: 0, lights: 1, harvest: 0, other: 0 });
});
it('ignores exhausted harvest tasks', () => {
  expect(dashboardStageTotals([group('Grow', [2])], [{ ...harvest, traysRemaining: 0 }])).toEqual({ blackout: 0, lights: 1, harvest: 0, other: 0 });
});
