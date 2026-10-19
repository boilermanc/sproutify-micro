import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import GrowingPage from './GrowingPage';
import { groupGrowingTrays } from '@/services/growingWorkspace';
import type { DailyTask } from '@/services/dailyFlowService';

const mocks = vi.hoisted(() => ({ groups: vi.fn(), tasks: vi.fn(), requests: vi.fn(), pending: vi.fn(), dialogTask: null as DailyTask | null }));
vi.mock('@/services/farmWorkBackend', () => ({ getFarmWorkCapabilities: vi.fn().mockResolvedValue({care:false,soak:false,seed:false}), listPendingFarmWork: mocks.pending }));
vi.mock('@/services/growingWorkspace', async importOriginal => ({ ...await importOriginal<typeof import('@/services/growingWorkspace')>(), fetchGrowingGroups: mocks.groups, fetchOutstandingPlantingRequests: mocks.requests }));
vi.mock('@/services/workerTasks', async importOriginal => ({ ...await importOriginal<typeof import('@/services/workerTasks')>(), fetchWorkerTasks: mocks.tasks }));
vi.mock('@/components/workspace/FarmWorkDialog', () => ({ default: ({ task, onSaved }: { task: DailyTask; onSaved: () => void }) => { mocks.dialogTask = task; return <div role="dialog"><button onClick={onSaved}>Confirm test save</button></div>; } }));
const crops = () => groupGrowingTrays([{ tray_id: 1, recipe_id: 42, sow_date: '2026-10-18', location: 'Rack A', recipes: { recipe_name: 'Radish' } }, { tray_id: 2, recipe_id: 42, sow_date: '2026-10-17', location: 'Rack B', recipes: { recipe_name: 'Radish' } }], [], []);
beforeEach(() => { localStorage.setItem('sproutify_session', JSON.stringify({ role: 'Owner', farmUuid: 'qa' })); mocks.groups.mockReset().mockResolvedValue(crops()); mocks.tasks.mockReset().mockResolvedValue([]); mocks.requests.mockReset().mockResolvedValue([]); mocks.pending.mockReset().mockReturnValue([]); mocks.dialogTask = null; });
afterEach(cleanup);
const openPage = () => render(<MemoryRouter><GrowingPage/></MemoryRouter>);
it('keeps an ambiguous care record reachable after its trays leave active crops', async () => {
  const original = { id: 'farm-care:original', action: 'Water', crop: 'Pea', taskSource: 'tray_step', recipeId: 42, trayIds: [99], trays: 1 } as DailyTask;
  mocks.pending.mockReturnValue([{ context: { task: original } }]);
  openPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Review saved care · Pea' }));
  expect(mocks.dialogTask?.id).toBe(original.id);
  expect(mocks.dialogTask?.trayIds).toEqual([99]);
  mocks.pending.mockReturnValue([]);
  fireEvent.click(screen.getByText('Confirm test save'));
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Unconfirmed care records' })).not.toBeInTheDocument());
});
it('shows partial planting work and opens the shared workflow with its original identity', async () => {
  mocks.tasks.mockResolvedValue([{ id: 'seed-99', action: 'Seed', crop: 'Pea', taskSource: 'seed_request', requestId: 99, trays: 4, quantity: 4, quantityCompleted: 3 }] as DailyTask[]);
  openPage();
  expect(await screen.findByText('1 trays remaining of 4')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Record seed' }));
  expect(mocks.dialogTask?.requestId).toBe(99);
  fireEvent.click(screen.getByText('Confirm test save'));
  await waitFor(() => expect(mocks.groups).toHaveBeenCalledTimes(2));
});
it('preserves context and pauses actions after a failed refresh, then recovers on retry', async () => {
  openPage(); await screen.findByText('2 active trays · 2 crop groups');
  mocks.groups.mockRejectedValueOnce(new Error('Network unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
  expect(screen.getAllByRole('heading', { name: 'Radish' })).toHaveLength(2);
  expect(screen.queryByText('No active crops yet')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Try again'));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});
it('limits a harvest task to the actual tray IDs in the chosen group', async () => {
  mocks.tasks.mockResolvedValue([{ id: 'harvest-3', action: 'Harvest', taskSource: 'tray_step', trayIds: [1, 2, 99], trays: 3, stepId: 3 }] as DailyTask[]);
  openPage(); await screen.findByText('2 active trays · 2 crop groups');
  fireEvent.click(screen.getAllByRole('button', { name: 'Harvest · 1 tray' })[0]);
  expect(mocks.dialogTask?.trayIds).toEqual([2]);
});
it('uses check-and-water language while keeping the original water action for the shared dialog', async () => {
  mocks.tasks.mockResolvedValue([{ id: 'water-3', action: 'Water', taskSource: 'tray_step', trayIds: [2], trays: 1, recipeId: 42 }] as DailyTask[]);
  openPage(); await screen.findByText('2 active trays · 2 crop groups');
  fireEvent.click(screen.getByRole('button', { name: 'Check & water as needed · 1 tray' }));
  expect(mocks.dialogTask?.action).toBe('Water');
  expect(mocks.dialogTask?.trayIds).toEqual([2]);
});
it('supports location search and hides full tray-record access from farm hands', async () => {
  localStorage.setItem('sproutify_session', JSON.stringify({ role: 'Farm Hand' }));
  openPage(); await screen.findByText('2 active trays · 2 crop groups');
  fireEvent.change(screen.getByLabelText('Search growing crops'), { target: { value: 'Rack B' } });
  expect(screen.getAllByRole('heading', { name: 'Radish' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Tray details' }));
  expect(screen.getByText('Tray 2')).toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByText('Not recorded — check the crop')).toBeInTheDocument();
});
it('shows future planting dates and lists an overlapping due request only once', async () => {
  const due = { id: 'seed-99', action: 'Seed', crop: 'Pea', taskSource: 'seed_request', requestId: 99, trays: 4, quantity: 4, quantityCompleted: 3 } as DailyTask;
  mocks.tasks.mockResolvedValue([due]);
  mocks.requests.mockResolvedValue([{ ...due, id: 'plan-99' }, { ...due, id: 'future-100', requestId: 100, crop: 'Sunflower', sowDate: '2026-10-25', trays: 2, quantity: 2, quantityCompleted: 0, sourceType: 'market' }]);
  openPage();
  expect(await screen.findByText('Sunflower')).toBeInTheDocument();
  expect(screen.getAllByText('1 trays remaining of 4')).toHaveLength(1);
  expect(screen.getByText(/2 trays remaining of 2 · Planned/)).toHaveTextContent('10/25/2026');
  expect(screen.getAllByRole('button', { name: 'Record seed' })).toHaveLength(2);
  expect(screen.getByText('Market')).toBeInTheDocument();
});
it('retains the planting list and reports failure rather than all-clear when its next read fails', async () => {
  mocks.requests.mockResolvedValue([{ id: 'future-100', action: 'Seed', crop: 'Sunflower', taskSource: 'seed_request', requestId: 100, trays: 2, sowDate: '2026-10-25' }] as DailyTask[]);
  openPage(); await screen.findByText('Sunflower');
  mocks.requests.mockRejectedValueOnce(new Error('Planting plan unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Planting plan unavailable');
  expect(screen.getByText('Sunflower')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Record seed' })).toBeDisabled();
  expect(screen.queryByText('Nothing waiting to be seeded. No preparation is due today.')).not.toBeInTheDocument();
});
