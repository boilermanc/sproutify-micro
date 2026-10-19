import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LocalFarmChat from './LocalFarmChat';
import type { DailyTask } from '@/services/dailyFlowService';
import type { WorkInput } from './farmWorkActions';

const mocks = vi.hoisted(() => ({ read: vi.fn(), review: null as null | { task: DailyTask; initialInput?: Partial<WorkInput>; previewOnly?: boolean } }));
vi.mock('@/services/workspaceTasks', () => ({ fetchGrowingWorkspace: mocks.read }));
vi.mock('./FarmRealtimeControls', () => ({ default: () => null }));
vi.mock('./FarmWorkDialog', () => ({ default: (props: { task: DailyTask | null; initialInput?: Partial<WorkInput>; previewOnly?: boolean }) => {
  if (!props.task) return null;
  mocks.review = { ...props, task: props.task };
  return <div role="dialog">Shared work review</div>;
} }));
const seed = (id = 'seed-1', location = 'Rack A'): DailyTask => ({ id, action: 'Seed', crop: 'Radish', location, batchId: 'N/A', dayCurrent: 0, dayTotal: 0, status: 'pending', trays: 4, quantity: 4, quantityCompleted: 0, trayIds: [], requestId: 1, recipeId: 1, taskSource: 'seed_request' });
beforeEach(() => {
  localStorage.clear(); localStorage.setItem('sproutify_session', JSON.stringify({ userId: 'owner-1', farmUuid: 'farm-1', role: 'Owner' }));
  mocks.read.mockReset().mockResolvedValue({ groups: [], tasks: [seed()] }); mocks.review = null;
});
afterEach(cleanup);
function open() { render(<MemoryRouter initialEntries={['/today']}><LocalFarmChat conversationMode="commands" /></MemoryRouter>); fireEvent.click(screen.getByRole('button', { name: 'Chat with your farm' })); }
function send(text: string) { fireEvent.change(screen.getByRole('textbox', { name: 'Message your farm' }), { target: { value: text } }); fireEvent.click(screen.getByRole('button', { name: 'Send message' })); }
it('answers next-work from fresh tasks without calling a hosted chatbot', async () => {
  open(); send('What’s next?'); expect(await screen.findByText(/Today has 1 work group/)).toBeInTheDocument(); expect(mocks.read).toHaveBeenCalledTimes(1);
});
it('drafts partial seeding, corrects its count, refreshes and opens the shared preview', async () => {
  open(); send('I seeded two trays radish'); await screen.findByText(/Draft: Seed/);
  send('Actually three trays'); await screen.findByText(/Unsaved draft · Radish · 3 trays/);
  fireEvent.click(screen.getByRole('button', { name: 'Review work form' })); await screen.findByRole('dialog');
  expect(mocks.read).toHaveBeenCalledTimes(2); expect(mocks.review).toMatchObject({ previewOnly: true, task: { id: 'seed-1' }, initialInput: { quantity: '3' } });
});
it('asks which work group instead of guessing', async () => {
  mocks.read.mockResolvedValue({ groups: [], tasks: [seed(), seed('seed-2', 'Rack B')] });
  open(); send('I seeded two trays radish'); await screen.findByText(/Which work group/);
  expect(screen.queryByRole('button', { name: 'Review work form' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Seed · Radish · Rack B/ })); expect(screen.getByText(/Draft: Seed · Radish · Rack B/)).toBeInTheDocument();
});
it('does not select arbitrary whole trays for partial harvest', async () => {
  mocks.read.mockResolvedValue({ groups: [], tasks: [{ ...seed(), id: 'harvest', action: 'Harvest', taskSource: 'tray_step', trayIds: [11, 12, 13], trays: 3 }] });
  open(); send('I harvested one tray radish'); await screen.findByText(/Draft: Harvest/);
  fireEvent.click(screen.getByRole('button', { name: 'Review work form' })); await screen.findByRole('dialog'); expect(mocks.review?.initialInput?.trayIds).toEqual([]);
});
it('never infers watering from a checked count', async () => {
  mocks.read.mockResolvedValue({ groups: [], tasks: [{ ...seed(), id: 'water', action: 'Water', taskSource: 'tray_step', trayIds: [11, 12], trays: 2 }] });
  open(); send('I checked two trays radish'); await screen.findByText(/Draft: Check/);
  fireEvent.click(screen.getByRole('button', { name: 'Review work form' })); await screen.findByRole('dialog'); expect(mocks.review?.initialInput?.trayIds).toBeUndefined();
});
it('refuses review after the task changes', async () => {
  open(); send('I seeded two trays radish'); await screen.findByText(/Draft: Seed/); mocks.read.mockResolvedValue({ groups: [], tasks: [] });
  fireEvent.click(screen.getByRole('button', { name: 'Review work form' })); await screen.findByText(/That task changed/); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('reports read failure without claiming all-clear', async () => {
  mocks.read.mockRejectedValue(new Error('offline')); open(); send('What’s next?'); await screen.findByText(/I could not refresh the farm tasks/); expect(screen.queryByRole('button', { name: 'Review work form' })).not.toBeInTheDocument();
});
it('discards an unsaved draft instead of changing history', async () => {
  open(); send('I seeded two trays radish'); await screen.findByText(/Draft: Seed/); send('Cancel'); expect(screen.getByText(/Draft discarded/)).toBeInTheDocument(); send('Actually three trays'); expect(screen.getByText(/There is no selected draft/)).toBeInTheDocument();
});
it('refuses review after a farm switch', async () => {
  open(); send('I seeded two trays radish'); await screen.findByText(/Draft: Seed/);
  localStorage.setItem('sproutify_session', JSON.stringify({ userId: 'owner-1', farmUuid: 'farm-2', role: 'Owner' }));
  fireEvent.click(screen.getByRole('button', { name: 'Review work form' })); await screen.findByText(/The farm session changed/); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('offers farm hands a Growing read without order tools', async () => {
  localStorage.setItem('sproutify_session', JSON.stringify({ userId: 'worker', farmUuid: 'farm-1', role: 'Farm Hand' }));
  open(); send('What’s growing?'); await screen.findByText('No active crop groups are recorded in Growing.'); expect(screen.queryByRole('link', { name: 'Orders' })).not.toBeInTheDocument();
});
