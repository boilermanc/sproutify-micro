import { afterEach, expect, it, vi } from 'vitest';
import { negotiateFarmVoice } from './farmRealtimeVoice';
const auth = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/supabaseClient', () => ({ getSupabaseClient: () => ({ auth: { getSession: auth.get } }) }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('requires sign-in and sends the bearer only to the local negotiation route', async () => {
  const request = vi.fn(); vi.stubGlobal('fetch', request); auth.get.mockResolvedValue({ data: { session: null } });
  await expect(negotiateFarmVoice('v=0\nm=audio', new AbortController().signal)).rejects.toThrow(/Sign in/); expect(request).not.toHaveBeenCalled();
  auth.get.mockResolvedValue({ data: { session: { access_token: 'qa-test-token', user: { id: 'qa' } } } });
  request.mockResolvedValue({ ok: true, json: async () => ({ sdp: 'v=0\nm=audio', writesEnabled: false }) });
  await expect(negotiateFarmVoice('v=0\nm=audio', new AbortController().signal)).resolves.toContain('m=audio');
  expect(request.mock.calls[0][0]).toMatch(/__farm_ai\/realtime$/); expect(request.mock.calls[0][1].headers.Authorization).toBe('Bearer qa-test-token');
});
it('rejects writes-enabled or invalid answers and surfaces safe server failures', async () => {
  auth.get.mockResolvedValue({ data: { session: { access_token: 'qa', user: { id: 'qa' } } } }); const request = vi.fn(); vi.stubGlobal('fetch', request);
  request.mockResolvedValue({ ok: true, json: async () => ({ sdp: 'v=0\nm=audio', writesEnabled: true }) }); await expect(negotiateFarmVoice('v=0\nm=audio', new AbortController().signal)).rejects.toThrow(/verified/);
  request.mockResolvedValue({ ok: false, json: async () => ({ error: 'Realtime voice is temporarily limited.' }) }); await expect(negotiateFarmVoice('v=0\nm=audio', new AbortController().signal)).rejects.toThrow(/temporarily limited/);
});
