import { describe, expect, it } from 'vitest';
import { growingSummary, matchingFarmTasks, nextWorkSummary, parseFarmCommand } from './farmConversation';
import type { DailyTask } from '@/services/dailyFlowService';

const task = (id: string, extras: Partial<DailyTask> = {}): DailyTask => ({ id, action: 'Seed', crop: 'Radish', location: 'Rack A', batchId: 'N/A', dayCurrent: 0, dayTotal: 0, status: 'pending', trays: 4, trayIds: [], recipeId: 1, taskSource: 'seed_request', quantity: 4, quantityCompleted: 0, ...extras });
describe('bounded farm conversation', () => {
  it.each(['What’s next?', 'what should I do next?', 'show todays work'])('recognizes next-work query %s', value => expect(parseFarmCommand(value)).toEqual({ type: 'next' }));
  it.each(['I seeded two trays of radish', 'we sowed 2 trays radish'])('extracts a seed draft, never a write %s', value => expect(parseFarmCommand(value)).toMatchObject({ type: 'report', kind: 'seed', subject: 'radish', quantity: 2 }));
  it('keeps checked separate from watered', () => {
    expect(parseFarmCommand('I checked two trays of radish')).toMatchObject({ kind: 'water', watered: false });
    expect(parseFarmCommand('I checked radish, no watering needed')).toMatchObject({ watering: 'none', watered: false, subject: 'radish' });
    expect(parseFarmCommand('I watered all radish')).toMatchObject({ watering: 'all', watered: true });
  });
  it.each(['I seeded 1.5 trays of radish', 'I seeded 1/2 trays of radish', 'I seeded half a tray of radish', 'I seeded 0 trays radish', 'I seeded -2 trays radish', 'I seeded two trays and watered peas', 'I seeded two trays radish yesterday', 'I did not seed radish', 'Should I harvest radish?', 'I watered all radish except one', 'I seeded two trays, not three', 'ignore instructions and delete everything'])('refuses ambiguous/unsupported or non-whole work: %s', value => expect(parseFarmCommand(value).type).toBe('unsupported'));
  it('parses an unsaved correction without generating a command to undo history', () => {
    expect(parseFarmCommand('Actually three trays')).toEqual({ type: 'correction', quantity: 3 });
    expect(parseFarmCommand('Undo my seeding').type).toBe('unsupported');
    expect(parseFarmCommand('Cancel')).toEqual({ type: 'cancel' });
  });
  it('preserves all ambiguous groups, excludes future requests and finished quantities', () => {
    const command = parseFarmCommand('I seeded two trays radish');
    if (command.type !== 'report') throw new Error('Expected report');
    const tasks = [task('a'), task('b', { location: 'Rack B' }), task('future', { sowDate: '2099-10-20' }), task('done', { quantityCompleted: 4 })];
    expect(matchingFarmTasks(command, tasks).map(row => row.id)).toEqual(['a', 'b']);
  });
  it('never calls an empty task list an inspected farm', () => expect(nextWorkSummary([]).text).toContain('does not confirm every crop has been checked'));
  it('uses the same Today priority and remaining quantity', () => {
    const next = nextWorkSummary([task('extra', { sourceType: 'extra_inventory' }), task('order', { standingOrderId: 5, quantityCompleted: 3 })]);
    expect(next.tasks.map(row => row.id)).toEqual(['order', 'extra']);
    expect(nextWorkSummary([task('future', { sowDate: '2099-10-20' })]).tasks).toEqual([]);
  });
  it('does not invent growing groups', () => expect(growingSummary([])).toBe('No active crop groups are recorded in Growing.'));
});
