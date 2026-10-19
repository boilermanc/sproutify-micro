import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import BetaSignupPage from './BetaSignupPage';
const mocks = vi.hoisted(() => ({ signup: vi.fn(), complete: vi.fn() }));
vi.mock('../lib/supabaseClient', () => ({ getSupabaseClient: () => ({ auth: { signUp: mocks.signup } }) }));
vi.mock('../utils/accountAccess', () => ({ completeFarmSignup: mocks.complete }));
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); mocks.complete.mockResolvedValue(undefined); });
afterEach(cleanup);
function submit() {
  render(<MemoryRouter><BetaSignupPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Alex' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'Alex@example.test' } });
  fireEvent.change(screen.getByLabelText('Farm Name'), { target: { value: 'Demo' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create beta account' }));
}
it('waits for email confirmation without provisioning or saving passwords', async () => {
  mocks.signup.mockResolvedValue({ data: { user: { id: 'user' }, session: null }, error: null }); submit();
  expect(await screen.findByText(/Check your inbox/)).toBeInTheDocument();
  expect(mocks.complete).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  expect(mocks.signup).toHaveBeenCalledWith({ email: 'alex@example.test', password: 'test-password', options: { data: { name: 'Alex', farm_name: 'Demo' } } });
});
it('completes farm setup when Auth supplies a session', async () => {
  mocks.signup.mockResolvedValue({ data: { user: { id: 'user' }, session: { access_token: 'test' } }, error: null }); submit();
  expect(await screen.findByText('Farm created. You can now sign in.')).toBeInTheDocument();
  expect(mocks.complete).toHaveBeenCalledWith('Alex', 'Demo');
});
it('shows completion failure without claiming a farm was created', async () => {
  mocks.signup.mockResolvedValue({ data: { user: { id: 'user' }, session: {} }, error: null });
  mocks.complete.mockRejectedValue(new Error('Setup failed')); submit();
  expect(await screen.findByText('Setup failed')).toBeInTheDocument();
  expect(screen.queryByText('Farm created. You can now sign in.')).not.toBeInTheDocument();
});
