import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DailyTask } from '@/services/dailyFlowService';
import TodayPage from './TodayPage';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), groups: vi.fn(), orders: vi.fn(), caps: vi.fn(), preparation: vi.fn() }));
vi.mock('@/services/growingWorkspace', async importOriginal => ({ ...await importOriginal<typeof import('@/services/growingWorkspace')>(), fetchGrowingGroups: mocks.groups, fetchOutstandingPlantingRequests: async () => [] }));
vi.mock('@/services/todayDashboard', () => ({ fetchTodayOrders: mocks.orders }));
vi.mock('@/services/farmWorkBackend', () => ({ getFarmWorkCapabilities: mocks.caps, fetchPreparationStatus: mocks.preparation, listPendingFarmWork: () => [] }));
vi.mock('@/services/workerTasks', () => ({
  fetchWorkerTasks: mocks.fetch,
  preparationTraysRemaining: (task: DailyTask) => Math.max(0, task.traysRemaining ?? ((task.quantity ?? task.trays) - (task.quantityCompleted ?? 0))),
}));
vi.mock('@/components/workspace/FarmWorkDialog', () => ({
  default: ({ task, onClose, onSaved }: { task: DailyTask | null; onClose: () => void; onSaved: () => void }) => task ? (
    <div role="dialog" aria-label="Farm work">
      <p>Selected {task.id}</p>
      <button onClick={onSaved}>Confirm saved</button>
      <button onClick={onClose}>Close</button>
    </div>
  ) : null,
}));

const fixture: DailyTask = {
  id: 'seed-42', action: 'Seed', crop: 'Radish', batchId: 'N/A', location: 'Not set',
  dayCurrent: 0, dayTotal: 0, trays: 4, traysRemaining: 2, status: 'pending',
  trayIds: [], recipeId: 42, taskSource: 'seed_request', customerName: 'Cafe',
};

beforeEach(() => { localStorage.clear(); mocks.fetch.mockReset(); mocks.fetch.mockResolvedValue([fixture]); mocks.groups.mockReset().mockResolvedValue([]); mocks.orders.mockReset().mockResolvedValue([]); mocks.caps.mockReset().mockResolvedValue({care:false,soak:false,seed:false}); mocks.preparation.mockReset().mockResolvedValue([]); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const show = () => render(<MemoryRouter><TodayPage /></MemoryRouter>);

it('shows outstanding trays and opens the shared workflow for the selected task', async () => {
  show();
  expect(await screen.findByText('2 trays remaining')).toBeInTheDocument();
  expect(screen.getByText('Customer · Cafe')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review Seed for Radish' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Selected seed-42');
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

it('refreshes after a confirmed save and removes completed work', async () => {
  mocks.fetch.mockResolvedValueOnce([fixture]).mockResolvedValueOnce([]);
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Review Seed for Radish' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm saved' }));
  expect(await screen.findByText('Nothing due in this task list')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
});

it('shows a failed read and retry instead of a false all-clear', async () => {
  mocks.fetch.mockRejectedValueOnce(new Error('Read failed')).mockResolvedValueOnce([fixture]);
  show();
  expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t load');
  expect(screen.queryByText('Nothing due in this task list')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('2 trays remaining')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('supports manual refresh and hides stale tasks when a refresh fails', async () => {
  mocks.fetch.mockResolvedValueOnce([fixture]).mockRejectedValueOnce(new Error('Read failed'));
  show();
  await screen.findByText('2 trays remaining');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.queryByText('Radish')).not.toBeInTheDocument();
});

it('ignores a late request after unmount', async () => {
  let finish!: (tasks: DailyTask[]) => void;
  mocks.fetch.mockReturnValueOnce(new Promise<DailyTask[]>(resolve => { finish = resolve; }));
  const first = show();
  first.unmount();
  await act(async () => { finish([fixture]); });
  expect(screen.queryByText('Radish')).not.toBeInTheDocument();
});

it('keeps the newest result when an earlier request finishes late', async () => {
  let finishOld!: (tasks: DailyTask[]) => void;
  mocks.fetch.mockReturnValueOnce(new Promise<DailyTask[]>(resolve => { finishOld = resolve; }))
    .mockResolvedValueOnce([]);
  render(<StrictMode><MemoryRouter><TodayPage /></MemoryRouter></StrictMode>);
  expect(await screen.findByText('Nothing due in this task list')).toBeInTheDocument();
  await act(async () => { finishOld([fixture]); });
  expect(screen.queryByText('Radish')).not.toBeInTheDocument();
  expect(screen.getByText('Nothing due in this task list')).toBeInTheDocument();
});

it('keeps care grouped without asking for a report on each tray', async () => {
  mocks.fetch.mockResolvedValueOnce([{ ...fixture, action: 'Water', taskSource: 'tray_step', trayIds: [1, 2], traysRemaining: 2 }]);
  show();
  await waitFor(() => expect(screen.getByText('Check & water as needed')).toBeInTheDocument());
  expect(screen.getAllByRole('button', { name: /^Review / })).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent('2 existing trays');
  expect(screen.getByRole('link', { name: /See what’s growing/ })).toHaveAttribute('href', '/growing');
});

it('keeps order management out of the Farm Hand view including the empty state', async () => {
  localStorage.setItem('sproutify_session', JSON.stringify({ role: 'FarmHand' }));
  mocks.fetch.mockResolvedValueOnce([]);
  show();
  await screen.findByText('Nothing due in this task list');
  expect(screen.queryByRole('link', { name: 'View orders' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Orders to review/)).not.toBeInTheDocument();
});

it('offers order review to an owner', async () => {
  localStorage.setItem('sproutify_session', JSON.stringify({ role: 'Owner' }));
  show();
  await screen.findByText('2 trays remaining');
  expect(screen.getByRole('link', { name: /View orders/ })).toHaveAttribute('href', '/orders');
});

it('keeps tasks usable when independent stage and order reads fail, with an orders-only retry', async () => {
  localStorage.setItem('sproutify_session', JSON.stringify({ role: 'Owner' }));
  mocks.groups.mockRejectedValue(new Error('Stages failed'));
  mocks.orders.mockRejectedValueOnce(new Error('Orders failed')).mockResolvedValueOnce([{ id: 1, customer: 'Cafe', itemsSummary: 'Radish × 2', status: 'Confirmed' }]);
  show();
  expect(await screen.findByRole('button', { name: 'Review Seed for Radish' })).toBeEnabled();
  expect(await screen.findByText('Today’s orders are unavailable.')).toBeInTheDocument();
  expect(screen.getByText(/Recorded crop stages are unavailable/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry orders' }));
  expect(await screen.findByText('Confirmed')).toBeInTheDocument();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

it('keeps a partial remainder after saving and refreshes stage reads', async () => {
  mocks.fetch.mockResolvedValueOnce([fixture]).mockResolvedValueOnce([{ ...fixture, traysRemaining: 1 }]);
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Review Seed for Radish' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm saved' }));
  expect(await screen.findByText('1 tray remaining')).toBeInTheDocument();
  expect(mocks.groups).toHaveBeenCalledTimes(2);
});

it('persists density and supports keyboard review without checkbox semantics', async () => {
  const user = userEvent.setup();
  const view = show();
  const review = await screen.findByRole('button', { name: 'Review Seed for Radish' });
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  review.focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Density' }), { target: { value: 'compact' } });
  expect(localStorage.getItem('sproutify_today_density_v1')).toBe('compact');
  view.unmount(); show();
  expect(screen.getByRole('combobox', { name: 'Density' })).toHaveValue('compact');
});

it('reloads after a local date change on focus, without reloading for same-day focus', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(2026, 9, 18, 23, 59));
  show();
  await act(async () => {});
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  fireEvent.focus(window);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  vi.setSystemTime(new Date(2026, 9, 19, 0, 1));
  await act(async () => { fireEvent.focus(window); });
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  expect(mocks.fetch.mock.calls[1][0].getDate()).toBe(19);
});

it('reloads at local midnight while the page stays open and cleans up its timer', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(2026, 9, 18, 23, 59, 50));
  const view = show();
  await act(async () => {});
  await act(async () => { vi.advanceTimersByTime(30_000); });
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('never reads order data for a Farm Hand', async () => {
  localStorage.setItem('sproutify_session', JSON.stringify({ role: 'Farm Hand' }));
  show();
  await screen.findByText('2 trays remaining');
  expect(mocks.orders).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: 'Orders due today' })).not.toBeInTheDocument();
});

it('shares preparation reads and shows a verified zero rather than unavailable', async () => {
  mocks.fetch.mockResolvedValue([]);
  mocks.caps.mockResolvedValue({care:false,soak:true,seed:true});
  show();
  await screen.findByText('Nothing due in this task list');
  expect(screen.getByText('Prepared seed: 0 · tray equivalents')).toBeInTheDocument();
  expect(mocks.preparation).toHaveBeenCalledTimes(1);
});

it('keeps prepared seed unavailable when the capability is absent', async () => {
  show();
  await screen.findByText('2 trays remaining');
  expect(screen.getByText('Prepared seed: Unavailable · tray equivalents')).toBeInTheDocument();
  expect(mocks.preparation).not.toHaveBeenCalled();
});
