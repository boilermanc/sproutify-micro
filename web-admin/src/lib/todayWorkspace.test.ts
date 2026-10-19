import { describe, expect, it } from 'vitest';
import type { DailyTask } from '@/services/dailyFlowService';
import { groupTodayTasks, taskGroup, taskPurpose, taskTrayCount, taskWorkLabel } from './todayWorkspace';

const task = (patch: Partial<DailyTask> = {}): DailyTask => ({
  id: 'one', action: 'Seed', crop: 'Radish', batchId: 'N/A', location: 'Not set',
  dayCurrent: 0, dayTotal: 0, trays: 4, status: 'pending', trayIds: [], recipeId: 42,
  taskSource: 'seed_request', ...patch,
});

describe('Today work grouping', () => {
  it('uses the remaining quantity after a partial seeding and excludes completed work', () => {
    const groups = groupTodayTasks([
      task({ quantity: 4, quantityCompleted: 2 }),
      task({ id: 'done', traysRemaining: 0 }),
      task({ id: 'overdone', quantity: 4, quantityCompleted: 5 }),
    ]);
    expect(groups.find(group => group.id === 'seed')?.tasks).toHaveLength(1);
    expect(taskTrayCount(groups.find(group => group.id === 'seed')!.tasks[0])).toBe(2);
  });

  it('puts outstanding and missed care in attention without losing the original action', () => {
    expect(taskGroup(task({ isOverdue: true }))).toBe('attention');
    expect(taskGroup(task({ status: 'urgent' }))).toBe('attention');
    expect(taskGroup(task({ missedSteps: [{ stepId: 2, stepName: 'Water', description: '', expectedDay: 2, trayIds: [1] }] }))).toBe('attention');
    expect(taskGroup(task({ action: 'Water', taskSource: 'tray_step' }))).toBe('water');
    expect(taskWorkLabel(task({ action: 'Water' }))).toBe('Check & water as needed');
  });

  it('keeps harvest, movement, and preparation distinct', () => {
    expect(taskGroup(task({ action: 'Harvest Radish', taskSource: 'tray_step' }))).toBe('harvest');
    expect(taskGroup(task({ action: 'Uncover', taskSource: 'tray_step' }))).toBe('tend');
    expect(taskGroup(task({ action: 'Soak', taskSource: 'soak_request' }))).toBe('seed');
  });

  it('orders known commitments before market and extras without guessing an unknown purpose', () => {
    const groups = groupTodayTasks([
      task({ id: 'extra', sourceType: 'extra_inventory' }),
      task({ id: 'unknown' }),
      task({ id: 'market', sourceType: 'market' }),
      task({ id: 'customer', customerName: 'Cafe' }),
      task({ id: 'standing', sourceType: 'standing_order', customerName: 'Cafe' }),
    ]);
    expect(groups.find(group => group.id === 'seed')?.tasks.map(row => row.id)).toEqual(['standing', 'customer', 'market', 'unknown', 'extra']);
    expect(taskPurpose(task())).toBeNull();
    expect(taskPurpose(task({ customerName: 'Cafe' }))).toBe('Customer · Cafe');
    expect(taskPurpose(task({ standingOrderId: 12 }))).toBe('Standing order');
  });

  it('keeps an order shortage visible even when no trays are ready', () => {
    const shortage = task({ taskSource: 'order_fulfillment', action: 'Fulfill order', trays: 0, traysRemaining: 0, traysNeeded: 4, traysReady: 0 });
    expect(taskTrayCount(shortage)).toBe(4);
    expect(groupTodayTasks([shortage])[0].tasks).toEqual([shortage]);
  });

  it('shows the oldest overdue request first within the same commitment priority', () => {
    const groups = groupTodayTasks([task({ id: 'recent', isOverdue: true, daysOverdue: 1 }), task({ id: 'older', isOverdue: true, daysOverdue: 3 })]);
    expect(groups[0].tasks.map(row => row.id)).toEqual(['older', 'recent']);
  });
});
