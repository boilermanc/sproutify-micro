import { getSupabaseClient } from '@/lib/supabaseClient';
import type { DailyTask } from './dailyFlowService';
import type { GrowingGroup } from './growingWorkspace';
import { taskTrayCount, groupTodayTasks } from '@/lib/todayWorkspace';
import { localDateString } from '@/lib/dateUtils';
import { workKind } from '@/components/workspace/farmWorkActions';
import { farmAssistantHeaders, farmAssistantUrl } from './farmAssistantApi';

export type ResponseCategory = 'info' | 'next' | 'clarify' | 'draft' | 'caution';
export const responseLabels: Record<ResponseCategory, string> = { info: 'Farm information', next: 'Next steps', clarify: 'A question for you', draft: 'Draft · not saved', caution: 'Needs attention' };
export interface AIProposal { taskId: string | null; kind: 'seed' | 'soak' | 'harvest' | 'water'; quantity: number | null; watering: 'all' | 'none' | 'unspecified'; watered: boolean }
export interface FarmAIReply { category: ResponseCategory; message: string; candidateTaskIds: string[]; proposal: AIProposal | null; draftDisposition: 'keep' | 'replace' | 'discard'; writesEnabled: false }
export interface ChatHistory { role: 'user' | 'assistant'; text: string }

export function validateFarmAIReply(value: unknown, tasks: DailyTask[]): FarmAIReply {
  if (!value || typeof value !== 'object') throw new Error('The AI response could not be verified. Nothing has been saved.');
  const reply = value as FarmAIReply;
  if (!Object.hasOwn(responseLabels, reply.category) || typeof reply.message !== 'string' || !reply.message.trim() || reply.message.length > 3000
    || reply.writesEnabled !== false || !Array.isArray(reply.candidateTaskIds) || reply.candidateTaskIds.length > 40
    || !['keep', 'replace', 'discard'].includes(reply.draftDisposition)) throw new Error('The AI response could not be verified. Nothing has been saved.');
  const byId = new Map(tasks.map(task => [task.id, task]));
  if (new Set(reply.candidateTaskIds).size !== reply.candidateTaskIds.length || reply.candidateTaskIds.some(id => !byId.has(id))) throw new Error('The AI referred to an unavailable task. Nothing has been saved.');
  if (reply.proposal !== null) {
    if (!['draft', 'clarify'].includes(reply.category)) throw new Error('Advice cannot become a completed-work draft. Nothing has been saved.');
    const proposal = reply.proposal;
    if (!proposal || !['seed', 'soak', 'harvest', 'water'].includes(proposal.kind) || proposal.quantity !== null && (!Number.isSafeInteger(proposal.quantity) || proposal.quantity <= 0)
      || !['all', 'none', 'unspecified'].includes(proposal.watering) || typeof proposal.watered !== 'boolean' || reply.draftDisposition !== 'replace') throw new Error('The work draft could not be verified. Nothing has been saved.');
    const ids = proposal.taskId === null ? reply.candidateTaskIds : [proposal.taskId];
    if (!ids.length || ids.some(id => { const task = byId.get(id); return !task || workKind(task) !== proposal.kind
      || proposal.quantity !== null && proposal.quantity > taskTrayCount(task)
      || ['seed', 'soak'].includes(proposal.kind) && task.sowDate && task.sowDate.slice(0, 10) > localDateString(); })) throw new Error('The work draft does not match the available task. Nothing has been saved.');
    if (proposal.kind !== 'water' && (proposal.watering !== 'unspecified' || proposal.watered)
      || proposal.watering === 'none' && proposal.watered || proposal.watering === 'all' && !proposal.watered) throw new Error('The watering result needs clarification. Nothing has been saved.');
  } else if (reply.draftDisposition === 'replace') throw new Error('The AI did not return a work draft. Nothing has been saved.');
  return reply;
}

export async function getFarmAIStatus(): Promise<boolean> {
  const response = await fetch(farmAssistantUrl('status'), { cache: 'no-store', signal: AbortSignal.timeout(5000), ...(import.meta.env.PROD ? { headers: await farmAssistantHeaders() } : {}) });
  if (!response.ok) return false;
  const status = await response.json();
  return status.ready === true && status.writesEnabled === false;
}

export function farmConversationSnapshot(message: string, data: { tasks: DailyTask[]; groups: GrowingGroup[] }, history: ChatHistory[], draft: { taskId: string; quantity: number | null } | null) {
  const ordered = groupTodayTasks(data.tasks).flatMap(group => group.tasks);
  const tasks = ordered.slice(0, 40);
  // Keep a retained draft reachable even if its task falls outside the first page.
  const held = draft && data.tasks.find(task => task.id === draft.taskId);
  if (held && !tasks.some(task => task.id === held.id)) tasks.splice(39, 1, held);
  return { message, today: localDateString(),
      tasks: tasks.map(task => ({ id: task.id, kind: workKind(task), crop: task.crop, location: task.location || 'Location not recorded', date: task.sowDate?.slice(0, 10) || null, remaining: taskTrayCount(task) })),
      groups: data.groups.slice(0, 20).map(group => ({ crop: group.crop, location: group.location, stage: group.stage, seededDate: group.seededDate?.slice(0, 10) || null, trays: group.trayIds.length })),
      history: history.slice(-12).map(row => ({ role: row.role, text: row.text.slice(0, 3000) })), draft: held ? draft : null,
      truncated: ordered.length > 40 || data.groups.length > 20,
    };
}
export async function converseWithFarm(message: string, data: { tasks: DailyTask[]; groups: GrowingGroup[] }, history: ChatHistory[], draft: { taskId: string; quantity: number | null } | null): Promise<FarmAIReply> {
  const { data: auth, error } = await getSupabaseClient().auth.getSession();
  if (error || !auth.session?.access_token || !auth.session.user?.id) throw new Error('Sign in to your farm before using AI. Nothing has been saved.');
  const snapshot = farmConversationSnapshot(message, data, history, draft);
  const response = await fetch(farmAssistantUrl('chat'), {
    method: 'POST', headers: await farmAssistantHeaders(),
    signal: AbortSignal.timeout(60000), body: JSON.stringify({ ...snapshot, userId: auth.session.user.id }),
  });
  let reply;
  try { reply = await response.json(); }
  catch { throw new Error('The local AI connection returned an unreadable reply. No work has been saved. Restart the local preview and try again.'); }
  if (!response.ok) throw new Error(typeof reply.error === 'string' ? reply.error : 'AI is unavailable. Nothing has been saved.');
  const ids = new Set(snapshot.tasks.map(task => task.id));
  return validateFarmAIReply(reply, data.tasks.filter(task => ids.has(task.id)));
}
