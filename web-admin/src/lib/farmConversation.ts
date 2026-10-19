import type { DailyTask } from '@/services/dailyFlowService';
import type { GrowingGroup } from '@/services/growingWorkspace';
import { groupTodayTasks, taskTrayCount, taskWorkLabel } from './todayWorkspace';
import { localDateString } from './dateUtils';

export type FarmCommand =
  | { type: 'next' } | { type: 'growing' } | { type: 'cancel' }
  | { type: 'correction'; quantity: number }
  | { type: 'report'; kind: 'seed' | 'soak' | 'harvest' | 'water'; subject: string; quantity?: number; watering?: 'all' | 'none'; watered?: boolean }
  | { type: 'unsupported'; message: string };
const numbers: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const quantityPattern = /\b(?:\d+(?:[./]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\b/g;
const unsupported = (message: string): FarmCommand => ({ type: 'unsupported', message });

/** A deliberately bounded local command language. No model, execution or save side effects. */
export function parseFarmCommand(raw: string): FarmCommand {
  const text = raw.toLowerCase().replace(/[’']/g, '').replace(/[?!.,]+$/g, '').trim();
  if (/^(cancel|never mind|nevermind|discard)(?: (?:it|that|draft))?$/.test(text)) return { type: 'cancel' };
  if (/^(?:whats next|what is next|what should i do next|what needs doing|what do i need to do|show todays work|show today)$/.test(text)) return { type: 'next' };
  if (/^(?:whats growing|what is growing|show growing|show (?:my )?crops|how are my crops)$/.test(text)) return { type: 'growing' };
  const correction = /^(?:actually|make that|i meant|correction)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?: trays?)?$/.exec(text);
  if (correction) {
    const quantity = numbers[correction[1]] ?? Number(correction[1]);
    return quantity > 0 && Number.isSafeInteger(quantity) ? { type: 'correction', quantity } : unsupported('Use a positive whole-tray count. Nothing has been saved.');
  }
  const report = /^(?:i |we )?(seeded|sowed|soaked|harvested|watered|checked)\s+(.+)$/.exec(text);
  if (!report || /\b(?:not|didnt|did not|except|yesterday|tomorrow|undo|delete|half|quarter)\b|\band\b|-\d/.test(text)) {
    return unsupported('Try “What’s next?”, “What’s growing?” or one completed action, such as “I seeded two trays of radish”. I can only review today’s whole-tray work here. Nothing has been saved.');
  }
  const verb = report[1];
  const words = report[2].match(quantityPattern) || [];
  const first = words[0];
  const quantity = first !== undefined ? numbers[first] ?? Number(first) : undefined;
  if (words.length > 1 || quantity !== undefined && (!Number.isSafeInteger(quantity) || quantity <= 0)) {
    return unsupported('Give one positive whole-tray count and the crop name. Use the work form to choose individual trays or exceptions. Nothing has been saved.');
  }
  const watering = verb === 'checked' && /\b(?:no watering needed|none needed water)\b/.test(text) ? 'none'
    : verb === 'watered' && /\ball\b/.test(text) ? 'all' : undefined;
  const subject = report[2].replace(quantityPattern, '').replace(/\b(?:no watering needed|none needed water|all|trays?|of|the|today)\b/g, '').replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
  return { type: 'report', kind: /seeded|sowed/.test(verb) ? 'seed' : verb === 'soaked' ? 'soak' : verb === 'harvested' ? 'harvest' : 'water', subject, quantity, watering, watered: verb === 'watered' };
}

export function matchingFarmTasks(command: Extract<FarmCommand, { type: 'report' }>, tasks: DailyTask[], date = new Date()): DailyTask[] {
  const today = localDateString(date);
  return tasks.filter(task => {
    const action = task.action.toLowerCase();
    const kindMatches = command.kind === 'water' ? /water/.test(action) : command.kind === 'harvest' ? /harvest/.test(action) : action === command.kind;
    const label = `${task.crop} ${task.location || ''} ${task.customerName || ''}`.toLowerCase();
    return kindMatches && taskTrayCount(task) > 0
      && (!task.sowDate || !['seed', 'soak'].includes(command.kind) || task.sowDate.slice(0, 10) <= today)
      && (!command.subject || command.subject.split(/\s+/).every(word => label.includes(word)));
  });
}

export function nextWorkSummary(tasks: DailyTask[], date = new Date()): { text: string; tasks: DailyTask[] } {
  const today = localDateString(date);
  const due = tasks.filter(task => !['Seed', 'Soak'].includes(task.action) || !task.sowDate || task.sowDate.slice(0, 10) <= today);
  const ordered = groupTodayTasks(due).flatMap(group => group.tasks);
  return ordered.length ? { text: `Today has ${ordered.length} work group${ordered.length === 1 ? '' : 's'}. Start with ${taskWorkLabel(ordered[0]).toLowerCase()} · ${ordered[0].crop}. Review the group before recording what you finished.`, tasks: ordered.slice(0, 6) }
    : { text: 'There is no work due in the available task list. That does not confirm every crop has been checked. Look at Growing to inspect your crops and review upcoming planting.', tasks: [] };
}

export function growingSummary(groups: GrowingGroup[]): string {
  if (!groups.length) return 'No active crop groups are recorded in Growing.';
  const listed = groups.slice(0, 6).map(group => `${group.crop}: ${group.trayIds.length} ${group.trayIds.length === 1 ? 'tray' : 'trays'} · ${group.location} · ${group.stage}`).join('\n');
  return `${groups.length} crop group${groups.length === 1 ? '' : 's'} recorded:\n${listed}${groups.length > 6 ? '\nOpen Growing for the remaining groups.' : ''}\nRecorded stages and scheduled harvest dates do not confirm readiness. Check the crops.`;
}
