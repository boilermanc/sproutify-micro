import { beforeEach, expect, it, vi } from 'vitest';
import { refreshSessionPayload } from './sessionRefresh';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), profile: vi.fn(), build: vi.fn(), filter: vi.fn() }));
vi.mock('../lib/supabaseClient', () => ({ getSupabaseClient: () => ({ auth: { getUser: mocks.getUser }, from: () => ({ select: () => ({ eq: (field: string, id: string) => { mocks.filter(field, id); return { single: mocks.profile }; } }) }) }) }));
vi.mock('./session', () => ({ buildSessionPayload: mocks.build }));
beforeEach(() => {
  localStorage.clear();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'actual-user', email: 'actual@example.test' } }, error: null });
  mocks.profile.mockResolvedValue({ data: { farm_uuid: 'farm-a', is_active: true }, error: null });
  mocks.build.mockResolvedValue({ farmUuid: 'farm-a', role: 'Owner' });
});
it.each([null, { farm_uuid: null, is_active: false }, { farm_uuid: 'farm-a', is_active: false }, { farm_uuid: '', is_active: true }])('rejects a missing, unassigned or inactive profile: %j', async profile => {
  mocks.profile.mockResolvedValue({ data: profile, error: null });
  expect(await refreshSessionPayload()).toBeNull();
  expect(mocks.build).not.toHaveBeenCalled();
});
it('loads a verified active membership by the Auth identity rather than browser cache', async () => {
  localStorage.setItem('sproutify_session', JSON.stringify({ userId: 'fake-admin' }));
  expect(await refreshSessionPayload()).toEqual({ farmUuid: 'farm-a', role: 'Owner' });
  expect(mocks.filter).toHaveBeenCalledWith('id', 'actual-user');
  // The App owns the epoch-checked commit; a slow lookup must have no cache side effects.
  expect(JSON.parse(localStorage.getItem('sproutify_session')!).userId).toBe('fake-admin');
});
it('does not load a profile without a verified Auth user', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });
  expect(await refreshSessionPayload()).toBeNull();
  expect(mocks.profile).not.toHaveBeenCalled();
});
