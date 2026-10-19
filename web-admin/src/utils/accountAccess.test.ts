import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completeFarmSignup, verifyPlatformAdmin } from './accountAccess';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), invoke: vi.fn() }));
vi.mock('../lib/supabaseClient', () => ({ getSupabaseClient: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, functions: { invoke: mocks.invoke } }) }));
beforeEach(() => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'real-user' } }, error: null });
  mocks.rpc.mockResolvedValue({ data: false, error: null });
});
describe('server account authorization', () => {
  it('checks the current Auth user and the protected registry', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect(await verifyPlatformAdmin()).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('is_admin_user');
  });
  it('rejects an absent Auth identity without querying the registry', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await verifyPlatformAdmin()).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{ data: true, error: new Error('denied') }, { data: 'true', error: null }, { data: null, error: null }])('fails closed on an invalid registry response: %j', async result => {
    mocks.rpc.mockResolvedValue(result);
    expect(await verifyPlatformAdmin()).toBe(false);
  });
  it('confirms the signup result and sends only editable farm details', async () => {
    mocks.invoke.mockResolvedValue({ data: { success: true, user: { id: 'real-user', farmUuid: 'farm-a' } }, error: null });
    await completeFarmSignup('Alex', 'Demo');
    expect(mocks.invoke).toHaveBeenCalledWith('signup', { body: { name: 'Alex', farmName: 'Demo' } });
  });
  it.each([{ data: {}, error: null }, { data: { success: true }, error: null }, { data: null, error: new Error('failed') }])('does not report an unconfirmed signup: %j', async result => {
    mocks.invoke.mockResolvedValue(result);
    await expect(completeFarmSignup('Alex', 'Demo')).rejects.toThrow();
  });
});
