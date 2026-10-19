import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import FarmHandLayout from './FarmHandLayout';

const fixture = vi.hoisted(() => ({
  status: 'active', days: 7 as number | null, demo: false, loading: false,
  subscription: vi.fn(), demoCheck: vi.fn(),
}));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: true, setDesktopViewPreference: vi.fn() }) }));
vi.mock('@/hooks/useDemoAccess', () => ({ useDemoAccess: () => { fixture.demoCheck(); return fixture.demo; } }));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => {
  fixture.subscription();
  return { subscription: { status: fixture.status, trialEndDate: null, activeTrayCount: 2, trayLimit: 50 }, isLoading: fixture.loading, getTrialDaysRemaining: () => fixture.days };
} }));
vi.mock('./onboarding/TrialBanner', () => ({ default: () => <p>Owner subscription banner</p> }));
vi.mock('./SubscriptionBlockedModal', () => ({ default: ({ status }: { status: string }) => <div role="alertdialog">Subscription blocked: {status}</div> }));
beforeEach(() => {
  fixture.status = 'active'; fixture.days = 7; fixture.demo = false; fixture.loading = false;
  fixture.subscription.mockClear(); fixture.demoCheck.mockClear();
  localStorage.setItem('sproutify_session', JSON.stringify({ role: 'Owner', farmName: 'QA farm' }));
});
afterEach(cleanup);
const layout = (role: string | null, path = '/today') => <MemoryRouter initialEntries={[path]}><FarmHandLayout verifiedRole={role} onLogout={() => {}}/></MemoryRouter>;

it('immediately removes owner navigation and desktop controls when the verified role changes', () => {
  const view = render(layout('Owner'));
  expect(screen.getByRole('link', { name: 'Orders' })).toBeInTheDocument();
  expect(screen.getAllByText(/Desktop View/).length).toBeGreaterThan(0);
  view.rerender(layout('Farm Hand'));
  expect(screen.queryByRole('link', { name: 'Orders' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Desktop View/)).not.toBeInTheDocument();
  expect(screen.queryByText('Owner subscription banner')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Today' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Growing' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Farm' })).toBeInTheDocument();
});
it.each(['Owner', 'Editor'])('mirrors expired-subscription blocking for phone %s', role => {
  fixture.status = 'expired'; render(layout(role));
  expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
  expect(screen.getByRole('alertdialog')).toHaveTextContent('expired');
  expect(screen.getByText('Owner subscription banner')).toBeInTheDocument();
});
it('does not present billing controls or load billing hooks for Farm Hands', () => {
  fixture.status = 'expired'; render(layout('Farm Hand'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.queryByText('Owner subscription banner')).not.toBeInTheDocument();
  expect(fixture.subscription).not.toHaveBeenCalled();
  expect(fixture.demoCheck).not.toHaveBeenCalled();
});
it('allows a blocked owner to reach the plans route', () => {
  fixture.status = 'expired'; render(layout('Owner', '/pricing'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});
it('preserves the verified QA demo exemption', () => {
  fixture.status = 'expired'; fixture.demo = true; render(layout('Owner'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});
it('blocks an ended trial but waits for subscription loading to finish', () => {
  fixture.status = 'trial'; fixture.days = 0; fixture.loading = true;
  const view = render(layout('Owner'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  fixture.loading = false; view.rerender(layout('Owner'));
  expect(screen.getByRole('alertdialog')).toHaveTextContent('trial_ended');
});
it('does not fall back to a stale cached Owner role when verifiedRole is explicitly null', () => {
  render(layout(null));
  expect(screen.queryByRole('link', { name: 'Orders' })).not.toBeInTheDocument();
  expect(screen.queryByText('Owner subscription banner')).not.toBeInTheDocument();
});
