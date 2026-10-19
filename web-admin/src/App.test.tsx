import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Outlet } from 'react-router-dom';
import App from './App';
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), mobile: false, event: null as null | ((event: string) => void) }));
vi.mock('./utils/sessionRefresh', () => ({ refreshSessionPayload: mocks.refresh }));
vi.mock('./hooks/useIsMobile', () => ({ useIsMobile: () => ({ shouldUseMobileLayout: mocks.mobile }) }));
vi.mock('./lib/supabaseClient', () => ({ getSupabaseClient: () => ({ auth: { onAuthStateChange: (fn: (event: string) => void) => { mocks.event = fn; return { data: { subscription: { unsubscribe: vi.fn() } } }; } } }) }));
vi.mock('./components/farmhand', () => ({ FarmHandTasks: () => null, FarmHandSeed: () => null, FarmHandHarvest: () => null, FarmHandCatalog: () => null, FarmHandCustomers: () => null, FarmHandLabels: () => null }));
vi.mock('./pages/LoginPage', () => ({ default: ({ onLogin }: { onLogin: (session: { farmUuid: string; role: string }) => void }) => <><p>Sign in form</p><button onClick={() => onLogin({ farmUuid: 'farm-a', role: 'Owner' })}>Complete verified login</button></> }));
vi.mock('./pages/Dashboard', () => ({ default: () => <p>Farm dashboard</p> }));
vi.mock('./pages/TodayPage', () => ({ default: () => <p>Today farm work</p> }));
vi.mock('./pages/GrowingPage', () => ({ default: () => <p>Growing crop groups</p> }));
vi.mock('./pages/FarmPage', () => ({ default: () => <p>Farm setup tools</p> }));
vi.mock('./pages/UsersPage', () => ({ default: () => null }));
vi.mock('./pages/VarietiesPage', () => ({ default: () => null }));
vi.mock('./pages/RecipesPage', () => ({ default: () => null }));
vi.mock('./pages/RecipeBuilder', () => ({ default: () => null }));
vi.mock('./pages/GlobalRecipesPage', () => ({ default: () => null }));
vi.mock('./pages/ProductsPage', () => ({ default: () => null }));
vi.mock('./pages/MixCalculatorPage', () => ({ default: () => null }));
vi.mock('./pages/BatchesPage', () => ({ default: () => null }));
vi.mock('./pages/OrdersPage', () => ({ default: () => <p>Owner order tools</p> }));
vi.mock('./pages/StandingOrdersPage', () => ({ default: () => null }));
vi.mock('./pages/PlantingSchedulePage', () => ({ default: () => null }));
vi.mock('./pages/CalendarPage', () => ({ default: () => null }));
vi.mock('./pages/WeeklyTasksPage', () => ({ default: () => null }));
vi.mock('./pages/CustomersPage', () => ({ default: () => null }));
vi.mock('./pages/VendorsPage', () => ({ default: () => null }));
vi.mock('./pages/SuppliesPage', () => ({ default: () => null }));
vi.mock('./pages/TraysPage', () => ({ default: () => null }));
vi.mock('./pages/ReportsPage', () => ({ default: () => null }));
vi.mock('./pages/SettingsPage', () => ({ default: () => <p>Own profile settings</p> }));
vi.mock('./pages/PricingPage', () => ({ default: () => null }));
vi.mock('./components/DailyFlow', () => ({ default: () => null }));
vi.mock('./components/LoadingState', () => ({ default: () => null }));
vi.mock('./components/Layout', () => ({ default: () => <Outlet /> }));
vi.mock('./components/FarmHandLayout', () => ({ default: () => <Outlet /> }));
vi.mock('./components/SageChat', () => ({ default: () => null }));
vi.mock('./pages/Activity', () => ({ default: () => null }));
vi.mock('./pages/HelpCenterPage', () => ({ default: () => null }));
vi.mock('./pages/CheckoutSuccessPage', () => ({ default: () => null }));
vi.mock('./pages/AdminLogin', () => ({ default: () => null }));
vi.mock('./components/RequireAdmin', () => ({ default: () => null }));
vi.mock('./components/AdminLayout', () => ({ default: () => <Outlet /> }));
vi.mock('./pages/AdminDashboard', () => ({ default: () => null }));
vi.mock('./pages/AdminFarmsUsers', () => ({ default: () => null }));
vi.mock('./pages/AdminRecipesVarieties', () => ({ default: () => null }));
vi.mock('./pages/AdminTraysBatches', () => ({ default: () => null }));
vi.mock('./pages/AdminCustomersOrders', () => ({ default: () => null }));
vi.mock('./pages/AdminProducts', () => ({ default: () => null }));
vi.mock('./pages/AdminNotifications', () => ({ default: () => null }));
vi.mock('./pages/AdminEmailBroadcast', () => ({ default: () => null }));
vi.mock('./pages/AdminEmailEvents', () => ({ default: () => null }));
vi.mock('./pages/AdminTestAccounts', () => ({ default: () => null }));
vi.mock('./pages/BetaSignupPage', () => ({ default: () => null }));
vi.mock('./pages/PasswordResetPage', () => ({ default: () => null }));
vi.mock('./pages/VerifyResetCode', () => ({ default: () => null }));

beforeEach(() => { localStorage.clear(); mocks.mobile = false; window.history.replaceState({}, '', '/admin/login'); mocks.refresh.mockResolvedValue(null); });
afterEach(cleanup);
it('lets an authenticated Farm Hand reach personal profile settings', async () => {
  window.history.replaceState({}, '', '/admin/profile');
  mocks.refresh.mockResolvedValue({farmUuid:'farm-a',role:'Farm Hand'});
  render(<App/>);expect(await screen.findByText('Own profile settings')).toBeInTheDocument();
});
it('keeps signed-out profile access behind login', async () => {
  window.history.replaceState({}, '', '/admin/profile');
  render(<App/>);expect(await screen.findByText('Sign in form')).toBeInTheDocument();
  expect(screen.queryByText('Own profile settings')).not.toBeInTheDocument();
});
it('keeps an unassigned or inactive bootstrap user on login despite a cached Owner', async () => {
  localStorage.setItem('sproutify_session', JSON.stringify({ role: 'Owner', farmUuid: 'fake' }));
  render(<App />);
  expect(await screen.findByText('Sign in form')).toBeInTheDocument();
  expect(screen.queryByText('Farm dashboard')).not.toBeInTheDocument();
  expect(localStorage.getItem('sproutify_session')).toBeNull();
});
it('defers Auth callbacks and keeps incomplete onboarding on login', async () => {
  render(<App />); await screen.findByText('Sign in form');
  const before = mocks.refresh.mock.calls.length;
  act(() => { expect(mocks.event?.('SIGNED_IN')).toBeUndefined(); });
  expect(mocks.refresh).toHaveBeenCalledTimes(before);
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(before + 1));
  expect(screen.getByText('Sign in form')).toBeInTheDocument();
});
it('ignores INITIAL_SESSION without canceling the pending startup check', async () => {
  let resolve!: (value: null) => void;
  mocks.refresh.mockReturnValue(new Promise<null>(r => { resolve = r; }));
  render(<App />);
  act(() => { mocks.event?.('INITIAL_SESSION'); });
  await act(async () => { resolve(null); });
  expect(screen.getByText('Sign in form')).toBeInTheDocument();
});
it('enters the farm app only with a confirmed active farm session', async () => {
  mocks.refresh.mockResolvedValue({ farmUuid: 'farm-a', role: 'Owner' }); render(<App />);
  expect(await screen.findByText('Today farm work')).toBeInTheDocument();
});

it('does not let a stale bootstrap refresh undo successful onboarding', async () => {
  render(<App />); await screen.findByText('Sign in form');
  let resolve!: (value: null) => void;
  mocks.refresh.mockReturnValue(new Promise<null>(r => { resolve = r; }));
  act(() => { mocks.event?.('SIGNED_IN'); });
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button', { name: 'Complete verified login' }));
  expect(await screen.findByText('Today farm work')).toBeInTheDocument();
  await act(async () => { resolve(null); });
  expect(screen.getByText('Today farm work')).toBeInTheDocument();
});

it.each(['Owner', 'Farm Hand'])('opens Growing for a verified %s without changing identity', async role => {
  window.history.replaceState({}, '', '/admin/growing');
  mocks.refresh.mockResolvedValue({farmUuid:'farm-a', role});
  render(<App />);
  expect(await screen.findByText('Growing crop groups')).toBeInTheDocument();
});

it.each(['/today', '/growing', '/farm'])('protects the new workspace route %s behind login', async path => {
  window.history.replaceState({}, '', `/admin${path}`);
  render(<App />);
  expect(await screen.findByText('Sign in form')).toBeInTheDocument();
});

it('keeps owner Orders available in the phone layout', async () => {
  mocks.mobile = true;
  window.history.replaceState({}, '', '/admin/orders');
  mocks.refresh.mockResolvedValue({farmUuid:'farm-a',role:'Owner'});
  render(<App />);
  expect(await screen.findByText('Owner order tools')).toBeInTheDocument();
});

it('does not admit a Farm Hand to legacy owner order tools', async () => {
  window.history.replaceState({}, '', '/admin/orders');
  mocks.refresh.mockResolvedValue({farmUuid:'farm-a',role:'Farm Hand'});
  render(<App />);
  expect(await screen.findByText('Today farm work')).toBeInTheDocument();
  expect(screen.queryByText('Owner order tools')).not.toBeInTheDocument();
});

it.each(['/', '/tasks'])('lands the old entry %s on Today', async path => {
  window.history.replaceState({}, '', `/admin${path}`);
  mocks.refresh.mockResolvedValue({farmUuid:'farm-a',role:'Owner'});
  render(<App />);
  expect(await screen.findByText('Today farm work')).toBeInTheDocument();
});

it('retains the detailed dashboard at its secondary route', async () => {
  window.history.replaceState({}, '', '/admin/dashboard');
  mocks.refresh.mockResolvedValue({farmUuid:'farm-a',role:'Owner'});
  render(<App />);
  expect(await screen.findByText('Farm dashboard')).toBeInTheDocument();
});
