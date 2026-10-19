import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RequireAdmin from './RequireAdmin';
const mocks = vi.hoisted(() => ({ verify: vi.fn(), unsubscribe: vi.fn(), event: null as null | (() => void) }));
vi.mock('../utils/accountAccess', () => ({ verifyPlatformAdmin: mocks.verify }));
vi.mock('../lib/supabaseClient', () => ({ getSupabaseClient: () => ({ auth: { onAuthStateChange: (event: () => void) => { mocks.event = event; return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }; } } }) }));
beforeEach(() => { localStorage.clear(); mocks.verify.mockResolvedValue(false); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const show = () => render(<MemoryRouter initialEntries={['/protected']}><Routes><Route path="/protected" element={<RequireAdmin><p>Private account screen</p></RequireAdmin>} /><Route path="/admin-portal/login" element={<p>Admin sign in</p>} /></Routes></MemoryRouter>);
it('denies forged Owner/admin browser storage', async () => {
  localStorage.setItem('sproutify_admin_session', JSON.stringify({ role: 'admin', userId: 'attacker' }));
  show();
  expect(await screen.findByText('Admin sign in')).toBeInTheDocument();
  expect(screen.queryByText('Private account screen')).not.toBeInTheDocument();
});
it('permits server-authorized admin without a cached admin session', async () => {
  mocks.verify.mockResolvedValue(true); show();
  expect(await screen.findByText('Private account screen')).toBeInTheDocument();
});
it('denies timeout and ignores late success', async () => {
  vi.useFakeTimers();
  let resolve!: (allowed: boolean) => void;
  mocks.verify.mockReturnValue(new Promise<boolean>(r => { resolve = r; }));
  show();
  await act(async () => { vi.advanceTimersByTime(5001); });
  expect(screen.getByText('Admin sign in')).toBeInTheDocument();
  await act(async () => { resolve(true); });
  expect(screen.queryByText('Private account screen')).not.toBeInTheDocument();
});
it('rechecks and closes access on an Auth change', async () => {
  mocks.verify.mockResolvedValueOnce(true).mockResolvedValue(false); show();
  await screen.findByText('Private account screen');
  act(() => { mocks.event?.(); });
  await waitFor(() => expect(screen.getByText('Admin sign in')).toBeInTheDocument());
});
