import { afterEach, expect, it, vi } from 'vitest';
import { farmAssistantHeaders, farmAssistantUrl } from './farmAssistantApi';
const auth = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/supabaseClient', () => ({ getSupabaseClient: () => ({ auth: { getSession: auth.get } }) }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it('uses the protected hosted endpoint and public API key only in production', async () => {
  vi.stubEnv('PROD', true); vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co'); vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test');
  auth.get.mockResolvedValue({ data: { session: { access_token: 'user-test', user: { id: 'qa' } } } });
  expect(farmAssistantUrl('realtime')).toBe('https://test.supabase.co/functions/v1/farm-assistant/realtime');
  expect(await farmAssistantHeaders()).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer user-test', apikey: 'public-test' });
});
it('retains same-origin local development and never starts authenticated calls without a login', async () => {
  vi.stubEnv('PROD', false); expect(farmAssistantUrl('chat')).toMatch(/__farm_ai\/chat$/);
  auth.get.mockResolvedValue({ data: { session: null } }); await expect(farmAssistantHeaders()).rejects.toThrow(/Sign in/);
});
