import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import UsersPage from './UsersPage';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), single: vi.fn(), list: vi.fn(), fetch: vi.fn() }));
vi.mock('../lib/supabaseClient', () => ({ getSupabaseClient: () => ({ auth: { getUser: mocks.getUser, getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) }, rpc: mocks.list, from: () => ({ select: () => ({ eq: (column: string) => column === 'id' ? { single: mocks.single } : mocks.list() }) }) }) }));
beforeEach(() => {
  localStorage.clear(); vi.stubGlobal('fetch', mocks.fetch);
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'real-owner' } }, error: null });
  mocks.single.mockResolvedValue({ data: { farm_uuid: 'real-farm', role: 'Owner', is_active: true }, error: null });
  mocks.list.mockResolvedValue({ data: [], error: null });
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, user: { id: 'new-user', farmUuid: 'real-farm', role: 'Farm Hand' }, verificationDelivery: 'sent' }) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function create() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add User' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Add User' }));
  fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Demo Worker' } });
  fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'worker@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
}
it('does not allow a Farm Hand to create accounts despite forged owner storage', async () => {
  localStorage.setItem('sproutify_session', JSON.stringify({ role: 'Owner', farmUuid: 'fake' }));
  mocks.single.mockResolvedValue({ data: { farm_uuid: 'real-farm', role: 'Farm Hand', is_active: true }, error: null }); render(<UsersPage />);
  expect(await screen.findByRole('button', { name: 'Add User' })).toBeDisabled();
});
it('keeps account creation disabled when the owner directory is unavailable', async () => {
  mocks.list.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Function unavailable' } });
  render(<UsersPage />);
  expect(await screen.findByText('Team management is unavailable. Please contact support before adding accounts.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add User' })).toBeDisabled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it('uses the confirmed owner farm and defaults new workers to Farm Hand', async () => {
  render(<UsersPage />); await create();
  expect(await screen.findByRole('status')).toHaveTextContent('verification email was requested');
  expect(mocks.list).toHaveBeenCalledWith('list_farm_users');
  const payload = JSON.parse(mocks.fetch.mock.calls[0][1].body);
  expect(payload.farmUuid).toBe('real-farm'); expect(payload.role).toBe('Farm Hand');
});
it('does not claim success for an empty or mismatched account response', async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, user: { id: 'wrong', farmUuid: 'other-farm', role: 'Owner' } }) });
  render(<UsersPage />); await create();
  expect(await screen.findByText('Failed to create user')).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('reports an account created with failed email delivery without retrying creation', async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, user: { id: 'new-user', farmUuid: 'real-farm', role: 'Farm Hand' }, verificationDelivery: 'failed' }) });
  render(<UsersPage />); await create();
  expect(await screen.findByRole('status')).toHaveTextContent('do not create the account again');
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});
it('rechecks owner permission when submitting an open form', async () => {
  render(<UsersPage />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add User' })).toBeEnabled());
  mocks.single.mockResolvedValue({ data: { farm_uuid: 'real-farm', role: 'Viewer', is_active: true }, error: null });
  await create();
  expect(await screen.findByText('Only an active farm owner can create accounts.')).toBeInTheDocument();
  expect(mocks.fetch).not.toHaveBeenCalled();
});
