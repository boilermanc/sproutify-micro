import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDemoAccess } from './useDemoAccess';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), event: null as null | (() => void) }));
vi.mock('../lib/supabaseClient', () => ({ getSupabaseClient: () => ({ auth: { getUser: mocks.getUser, onAuthStateChange: (fn: () => void) => { mocks.event = fn; return { data: { subscription: { unsubscribe: vi.fn() } } }; } }, rpc: mocks.rpc }) }));
beforeEach(() => { localStorage.clear(); mocks.getUser.mockResolvedValue({ data: { user: { id: 'real-user', email: 'real@example.test' } }, error: null }); mocks.rpc.mockResolvedValue({ data: false, error: null }); });
afterEach(cleanup);
it('ignores a cached team email and checks the real Auth email', async () => {
  localStorage.setItem('sproutify_session', JSON.stringify({ email: 'fake@sproutify.app' }));
  const { result } = renderHook(useDemoAccess);
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('is_test_account', { check_email: 'real@example.test' }));
  expect(result.current).toBe(false);
});
it('does not grant a team-domain exemption without an explicit server grant', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { email: 'team@sproutify.app' } }, error: null });
  const { result } = renderHook(useDemoAccess);
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
  expect(result.current).toBe(false);
});
it('grants only a successful true server response and resets on identity change', async () => {
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  const { result } = renderHook(useDemoAccess);
  await waitFor(() => expect(result.current).toBe(true));
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  act(() => { mocks.event?.(); });
  expect(result.current).toBe(false);
});
it('ignores a previous identity check that completes after sign-out', async () => {
  let resolve!: (result: unknown) => void;
  mocks.rpc.mockReturnValue(new Promise(r => { resolve = r; }));
  const { result } = renderHook(useDemoAccess);
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  act(() => { mocks.event?.(); });
  await act(async () => { resolve({ data: true, error: null }); });
  expect(result.current).toBe(false);
});
it('fails closed on a registry error', async () => {
  mocks.rpc.mockResolvedValue({ data: true, error: new Error('denied') });
  const { result } = renderHook(useDemoAccess);
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
  expect(result.current).toBe(false);
});
