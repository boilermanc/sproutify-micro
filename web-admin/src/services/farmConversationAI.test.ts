import { afterEach, expect, it, vi } from 'vitest';
import { converseWithFarm, validateFarmAIReply } from './farmConversationAI';
import type { DailyTask } from './dailyFlowService';
const session = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/supabaseClient', () => ({ getSupabaseClient: () => ({ auth: { getSession: session.get } }) }));
const task: DailyTask = { id: 'seed-1', action: 'Seed', crop: 'Radish', location: 'Rack A', batchId: 'N/A', dayCurrent: 0, dayTotal: 0, trays: 4, quantity: 4, quantityCompleted: 0, trayIds: [], recipeId: 1, requestId: 1, status: 'pending', taskSource: 'seed_request' };
const reply = () => ({ category: 'draft', message: 'Two trays are a draft. Nothing has been saved.', candidateTaskIds: [], draftDisposition: 'replace', writesEnabled: false, proposal: { taskId: 'seed-1', kind: 'seed', quantity: 2, watering: 'unspecified', watered: false } });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('independently rejects unknown tasks, fractions, action mismatches and writes-enabled responses', () => {
  expect(validateFarmAIReply(reply(), [task]).writesEnabled).toBe(false);
  for (const proposal of [{ ...reply().proposal, taskId: 'other-farm' }, { ...reply().proposal, quantity: 1.5 }, { ...reply().proposal, quantity: 8 }, { ...reply().proposal, kind: 'harvest' }, { ...reply().proposal, watered: true }]) expect(() => validateFarmAIReply({ ...reply(), proposal }, [task])).toThrow();
  expect(() => validateFarmAIReply({ ...reply(), writesEnabled: true }, [task])).toThrow();
});
it('sends a minimal farm snapshot, only local authorization, bounded history and no contact details', async () => {
  session.get.mockResolvedValue({ data: { session: { access_token: 'test-auth-token', user: { id: 'qa-owner', email: 'private@example.invalid' } } }, error: null });
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => reply() }); vi.stubGlobal('fetch', request);
  await converseWithFarm('I sowed a couple. What now?', { tasks: [{ ...task, customerName: 'Private Customer' }], groups: [] }, Array.from({ length: 20 }, () => ({ role: 'user' as const, text: 'earlier question' })), null);
  const [url, options] = request.mock.calls[0];
  expect(url).toMatch(/__farm_ai\/chat$/); expect(options.headers.Authorization).toBe('Bearer test-auth-token');
  expect(options.body).not.toContain('Private Customer'); expect(options.body).not.toContain('private@example.invalid'); expect(options.body).not.toContain('test-auth-token');
  expect(JSON.parse(options.body).history).toHaveLength(12);
});
it('requires a current Auth session before contacting the proxy', async () => {
  session.get.mockResolvedValue({ data: { session: null }, error: null }); const request = vi.fn(); vi.stubGlobal('fetch', request);
  await expect(converseWithFarm('hello', { tasks: [task], groups: [] }, [], null)).rejects.toThrow(/Sign in/); expect(request).not.toHaveBeenCalled();
});
it('keeps missing-key and provider errors visible instead of falling back to commands', async () => {
  session.get.mockResolvedValue({ data: { session: { access_token: 'test-token', user: { id: 'qa-owner' } } }, error: null });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Local AI setup is incomplete. No work has been saved.' }) }));
  await expect(converseWithFarm('Can you help me?', { tasks: [], groups: [] }, [], null)).rejects.toThrow(/setup is incomplete/);
});
