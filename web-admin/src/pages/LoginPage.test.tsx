import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), resend: vi.fn(), profile: vi.fn(), complete: vi.fn(), admin: vi.fn(), build: vi.fn(), login: vi.fn() }));
vi.mock('../lib/supabaseClient', () => ({ getSupabaseClient: () => ({ auth: { signInWithPassword: mocks.signIn, resend: mocks.resend }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }) }) }));
vi.mock('../utils/accountAccess', () => ({ completeFarmSignup: mocks.complete, verifyPlatformAdmin: mocks.admin }));
vi.mock('../utils/session', () => ({ buildSessionPayload: mocks.build }));
beforeEach(() => {
  localStorage.clear(); mocks.admin.mockResolvedValue(false);
  mocks.signIn.mockResolvedValue({ data: { user: { id: 'real-user', email: 'real@example.test', user_metadata: { name: 'Alex', farm_name: 'Demo' } }, session: {} }, error: null });
  mocks.profile.mockResolvedValue({ data: { id: 'real-user', farm_uuid: 'farm-a', role: 'Owner', is_active: true }, error: null });
  mocks.complete.mockResolvedValue(undefined); mocks.resend.mockResolvedValue({ error: null });
  mocks.build.mockResolvedValue({ farmUuid: 'farm-a', role: 'Owner' });
});
afterEach(cleanup);
function show(url = '/login') { render(<MemoryRouter initialEntries={[url]}><LoginPage onLogin={mocks.login} /></MemoryRouter>); }
function signIn() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'real@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}
it('does not authenticate or pick a profile from an email-only link or forged cache', async () => {
  localStorage.setItem('sproutify_session', JSON.stringify({ role: 'Owner', userId: 'other' }));
  show('/login?email=other@example.test');
  expect(screen.getByLabelText('Email')).toHaveValue('other@example.test');
  expect(mocks.signIn).not.toHaveBeenCalled(); expect(mocks.profile).not.toHaveBeenCalled(); expect(mocks.login).not.toHaveBeenCalled();
});
it('resumes verified-user farm setup, then reloads the confirmed profile', async () => {
  mocks.profile.mockResolvedValueOnce({ data: { farm_uuid: null }, error: null }); show(); signIn();
  await waitFor(() => expect(mocks.login).toHaveBeenCalled());
  expect(mocks.complete).toHaveBeenCalledWith('Alex', 'Demo');
  expect(mocks.profile).toHaveBeenCalledTimes(2);
});
it('does not publish a browser session if farm completion fails', async () => {
  mocks.profile.mockResolvedValue({ data: null, error: null }); mocks.complete.mockRejectedValue(new Error('Cannot complete farm')); show(); signIn();
  expect(await screen.findByText('Cannot complete farm')).toBeInTheDocument();
  expect(mocks.login).not.toHaveBeenCalled(); expect(localStorage.getItem('sproutify_session')).toBeNull();
});
it('rejects an inactive farm profile', async () => {
  mocks.profile.mockResolvedValue({ data: { farm_uuid: 'farm-a', is_active: false }, error: null }); show(); signIn();
  expect(await screen.findByText(/An active farm membership is required/)).toBeInTheDocument();
  expect(mocks.login).not.toHaveBeenCalled();
});
it('resends a verification email through normal Auth', async () => {
  show('/login?email=real@example.test'); fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));
  expect(await screen.findByRole('status')).toHaveTextContent('check your inbox');
  expect(mocks.resend).toHaveBeenCalledWith({ type: 'signup', email: 'real@example.test' });
});
