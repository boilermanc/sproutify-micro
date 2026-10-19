import { afterEach, expect, it, vi } from 'vitest';
import { fetchSpokenReply, transcribeVoice } from './farmVoice';
const auth = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('@/lib/supabaseClient', () => ({ getSupabaseClient: () => ({ auth: { getSession: auth.session } }) }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
function signedIn() { auth.session.mockResolvedValue({ data: { session: { access_token: 'test-only-token', user: { id: 'qa-user' } } }, error: null }); }
it('uploads audio only to the authenticated local endpoint and verifies the transcript', async () => {
  signedIn(); const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'I seeded two trays.', writesEnabled: false }) }); vi.stubGlobal('fetch', request);
  const clip = new Blob(['test clip'], { type: 'audio/webm' });
  expect(await transcribeVoice(clip, 1500, new AbortController().signal)).toBe('I seeded two trays.');
  expect(request.mock.calls[0][0]).toMatch(/__farm_ai\/transcribe$/); expect(request.mock.calls[0][1].body).toBe(clip); expect(request.mock.calls[0][1].headers['x-farm-user']).toBe('qa-user');
});
it('requires Auth before sending voice data', async () => {
  auth.session.mockResolvedValue({ data: { session: null }, error: null }); const request = vi.fn(); vi.stubGlobal('fetch', request);
  await expect(transcribeVoice(new Blob(['test']), 1000, new AbortController().signal)).rejects.toThrow(/Sign in/); expect(request).not.toHaveBeenCalled();
});
it('rejects malformed transcript and audio replies', async () => {
  signedIn(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: '', writesEnabled: false }) }));
  await expect(transcribeVoice(new Blob(['test']), 1000, new AbortController().signal)).rejects.toThrow(/verified/);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['html'], { type: 'text/html' }) }));
  await expect(fetchSpokenReply('Hello', new AbortController().signal)).rejects.toThrow(/verified/);
});
it('retains readable provider errors and lets the UI keep text available', async () => {
  signedIn(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Spoken reply unavailable. You can still read it.' }) }));
  await expect(fetchSpokenReply('Hello', new AbortController().signal)).rejects.toThrow(/still read/);
});
