import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import FarmWorkDialog from './FarmWorkDialog';
import { loadWorkSeedOptions, recordFarmWork } from './farmWorkActions';
import { FarmWorkRejectedError, FarmWorkRetryError, getFarmWorkCapabilities, retryPendingFarmWork } from '@/services/farmWorkBackend';
import type { DailyTask } from '@/services/dailyFlowService';

vi.mock('./farmWorkActions', async importOriginal => ({ ...await importOriginal<typeof import('./farmWorkActions')>(), recordFarmWork: vi.fn(), loadWorkSeedOptions: vi.fn() }));
vi.mock('@/services/farmWorkBackend', async importOriginal => ({ ...await importOriginal<typeof import('@/services/farmWorkBackend')>(), getFarmWorkCapabilities: vi.fn(), retryPendingFarmWork: vi.fn() }));
const task: DailyTask = { id: 'harvest', action: 'Harvest', crop: 'Pea', batchId: 'batch', location: 'Shelf A', dayCurrent: 10, dayTotal: 10, trays: 2, trayIds: [11, 12], recipeId: 7, stepId: 2, status: 'pending' };
const allCaps = { care: true, soak: true, seed: true };
it('prefills a chat draft but prevents every preview write', async () => {
  const onSaved = vi.fn();
  render(<FarmWorkDialog task={{ ...task, id: 'chat-preview' }} initialInput={{ trayIds: [12], weight: '80' }} previewOnly onClose={vi.fn()} onSaved={onSaved} />);
  await waitFor(() => expect(screen.queryByText('Checking available farm actions…')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Total harvest weight (g, optional)')).toHaveValue(80);
  expect(screen.getByLabelText('Tray 12')).toBeChecked();
  expect(screen.getByLabelText('Tray 11')).not.toBeChecked();
  confirm();
  const button = screen.getByRole('button', { name: 'Local preview · saving disabled' });
  expect(button).toBeDisabled(); fireEvent.click(button);
  expect(recordFarmWork).not.toHaveBeenCalled(); expect(retryPendingFarmWork).not.toHaveBeenCalled(); expect(onSaved).not.toHaveBeenCalled();
});
const noCaps = { care: false, soak: false, seed: false };
const seedOptions = { gramsPerTray: 20, batches: [{ id: 34, label: 'Pea seed', availableGrams: 100 }] };
async function ready(selected: DailyTask = task, onSaved = vi.fn(), onClose = vi.fn()) {
  render(<FarmWorkDialog task={selected} onClose={onClose} onSaved={onSaved} />);
  await waitFor(() => expect(screen.queryByText('Checking available farm actions…')).not.toBeInTheDocument());
  if (selected.action === 'Seed' || selected.action === 'Soak') await waitFor(() => expect(screen.queryByText('Checking seed inventory…')).not.toBeInTheDocument());
}
const confirm = () => fireEvent.click(screen.getByLabelText(/I finished this work|I checked every tray/));
afterEach(() => { cleanup(); localStorage.clear(); });
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('sproutify_session', JSON.stringify({ role: 'Owner', farmUuid: 'qa-farm', userId: 'qa-owner' }));
  vi.mocked(getFarmWorkCapabilities).mockResolvedValue(noCaps);
  vi.mocked(loadWorkSeedOptions).mockResolvedValue(seedOptions);
  vi.mocked(recordFarmWork).mockResolvedValue();
  vi.mocked(retryPendingFarmWork).mockResolvedValue();
});

it('does not record work merely by opening or selecting trays', async () => {
  await ready();
  expect(screen.getByRole('button', { name: 'Save completed work' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Tray 12'));
  expect(recordFarmWork).not.toHaveBeenCalled();
  expect(screen.getByText(/1 selected whole trays/)).toBeInTheDocument();
});

it('requires confirmation and sends edited harvest selection on explicit save', async () => {
  const saved = vi.fn(); const close = vi.fn();
  await ready(task, saved, close);
  fireEvent.click(screen.getByLabelText('Tray 12'));
  fireEvent.change(screen.getByLabelText('Total harvest weight (g, optional)'), { target: { value: '90' } });
  confirm(); fireEvent.click(screen.getByRole('button', { name: 'Save completed work' }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(recordFarmWork).toHaveBeenCalledWith(task, expect.objectContaining({ trayIds: [11], weight: '90' }), null, noCaps);
  expect(close).toHaveBeenCalledTimes(1);
});

it('locks legacy ambiguous saves across reopen and preserves entered values', async () => {
  vi.mocked(recordFarmWork).mockRejectedValue(new Error('Connection lost'));
  const selected = { ...task, id: 'ambiguous-legacy' };
  await ready(selected);
  fireEvent.change(screen.getByLabelText('Total harvest weight (g, optional)'), { target: { value: '100' } });
  confirm(); fireEvent.click(screen.getByRole('button', { name: 'Save completed work' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Refresh Today and Growing/));
  expect(screen.getByLabelText('Total harvest weight (g, optional)')).toHaveValue(100);
  expect(screen.getByRole('button', { name: 'Save completed work' })).toBeDisabled();
  cleanup(); await ready(selected);
  expect(screen.getByRole('alert')).toHaveTextContent(/previous attempt needs reconciliation/);
  expect(screen.getByRole('button', { name: 'Save completed work' })).toBeDisabled();
});

it('keeps check-only saves unavailable when care capability is absent', async () => {
  await ready({ ...task, action: 'Water' }); confirm();
  expect(screen.getByRole('button', { name: 'Save completed work' })).toBeDisabled();
  expect(screen.getByText(/Check-only visits cannot be saved yet/)).toBeInTheDocument();
});

it('retains the legacy whole-group watering choice when capability is absent', async () => {
  await ready({ ...task, id: 'water-legacy', action: 'Water' });
  fireEvent.click(screen.getByLabelText('All 2 trays needed water and were watered')); confirm();
  expect(screen.getByRole('button', { name: 'Save completed work' })).toBeEnabled();
});

it('records one explicit group check with no watering without per-tray reporting', async () => {
  vi.mocked(getFarmWorkCapabilities).mockResolvedValue(allCaps);
  const selected = { ...task, id: 'water-none', action: 'Water' };
  await ready(selected);
  fireEvent.click(screen.getByLabelText('No watering needed'));
  expect(screen.queryByLabelText('Tray 11')).not.toBeInTheDocument();
  expect(recordFarmWork).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Save completed work' })).toBeDisabled();
  confirm(); fireEvent.click(screen.getByRole('button', { name: 'Save completed work' }));
  await waitFor(() => expect(recordFarmWork).toHaveBeenCalledWith(selected, expect.objectContaining({ trayIds: [] }), null, allCaps));
});

it('opens exceptions only for partial watering and sends only the actual watered subset', async () => {
  vi.mocked(getFarmWorkCapabilities).mockResolvedValue(allCaps);
  const selected = { ...task, id: 'water-some', action: 'Water' };
  await ready(selected); fireEvent.click(screen.getByLabelText('Some needed water')); confirm();
  expect(screen.getByRole('button', { name: 'Save completed work' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Tray 12')); confirm();
  fireEvent.click(screen.getByRole('button', { name: 'Save completed work' }));
  await waitFor(() => expect(recordFarmWork).toHaveBeenCalledWith(selected, expect.objectContaining({ trayIds: [12] }), null, allCaps));
});

it('gates Farm Hand seeding on the installed capability', async () => {
  localStorage.setItem('sproutify_session', JSON.stringify({ role: 'FarmHand', farmUuid: 'qa-farm', userId: 'qa-hand' }));
  const selected = { ...task, id: 'seed-worker', action: 'Seed', requestId: 15 };
  await ready(selected);
  expect(screen.getByText(/Ask an owner to record seeding and soaking/)).toBeInTheDocument();
  expect(loadWorkSeedOptions).not.toHaveBeenCalled();
  cleanup(); vi.mocked(getFarmWorkCapabilities).mockResolvedValue(allCaps);
  await ready(selected); confirm();
  expect(screen.getByRole('button', { name: 'Save completed work' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Save completed work' }));
  await waitFor(() => expect(recordFarmWork).toHaveBeenCalledWith(selected, expect.objectContaining({ batchId: '34', quantity: '2' }), seedOptions, allCaps));
});

it('records partial soaking with actual dry seed grams and keeps remaining trays visible', async () => {
  vi.mocked(getFarmWorkCapabilities).mockResolvedValue(allCaps);
  await ready({ ...task, id: 'soak-partial', action: 'Soak', requestId: 15 });
  fireEvent.change(screen.getByLabelText('Trays being prepared'), { target: { value: '1' } });
  const weight = screen.getByLabelText('Actual dry seed weight put into soak (g)');
  fireEvent.change(weight, { target: { value: '-1' } }); confirm();
  expect(screen.getByRole('button', { name: 'Save completed work' })).toBeDisabled();
  fireEvent.change(weight, { target: { value: '17' } }); confirm();
  expect(screen.getByRole('button', { name: 'Save completed work' })).toBeDisabled();
  expect(screen.getByText(/actual grams must match the recipe weight/)).toBeInTheDocument();
  fireEvent.change(weight, { target: { value: '20' } }); confirm();
  expect(screen.queryByText(/Recording soaking is unavailable/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save completed work' }));
  await waitFor(() => expect(recordFarmWork).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ quantity: '1', weight: '20' }), seedOptions, allCaps));
});

it('prevents duplicate in-flight submits and freezes exact safe retries across reopen', async () => {
  vi.mocked(getFarmWorkCapabilities).mockResolvedValue(allCaps);
  let reject!: (error: Error) => void;
  vi.mocked(recordFarmWork).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const selected = { ...task, id: 'safe-retry', action: 'Water' };
  await ready(selected); fireEvent.click(screen.getByLabelText('All needed water')); confirm();
  const save = screen.getByRole('button', { name: 'Save completed work' }); fireEvent.click(save); fireEvent.click(save);
  expect(recordFarmWork).toHaveBeenCalledTimes(1);
  reject(new FarmWorkRetryError());
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry same record' })).toBeEnabled());
  expect(screen.getByLabelText('No watering needed')).toBeDisabled();
  cleanup(); await ready(selected);
  expect(screen.getByRole('button', { name: 'Retry same record' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry same record' }));
  await waitFor(() => expect(recordFarmWork).toHaveBeenCalledTimes(2));
  expect(vi.mocked(recordFarmWork).mock.calls[0][1]).toEqual(vi.mocked(recordFarmWork).mock.calls[1][1]);
});

it('permits correcting a definitely rejected transaction without reconciliation lock', async () => {
  vi.mocked(getFarmWorkCapabilities).mockResolvedValue(allCaps);
  vi.mocked(recordFarmWork).mockRejectedValueOnce(new FarmWorkRejectedError());
  await ready({ ...task, id: 'safe-rejected', action: 'Water' });
  fireEvent.click(screen.getByLabelText('All needed water')); confirm();
  fireEvent.click(screen.getByRole('button', { name: 'Save completed work' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No work was saved'));
  expect(screen.getByLabelText('No watering needed')).toBeEnabled();
  fireEvent.click(screen.getByLabelText('No watering needed')); confirm();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save completed work' })).toBeEnabled();
});

it('fails closed when capability verification fails instead of falling back to an unsafe save', async () => {
  vi.mocked(getFarmWorkCapabilities).mockRejectedValue(new Error('Network unavailable'));
  await ready({ ...task, id: 'capability-failed', action: 'Water' });
  fireEvent.click(screen.getByLabelText('All 2 trays needed water and were watered')); confirm();
  expect(screen.getByRole('button', { name: 'Save completed work' })).toBeDisabled();
  expect(screen.getByText(/Available farm actions could not be verified/)).toBeInTheDocument();
});

it('allows a frozen preparation retry after stock was consumed by the uncertain first save', async () => {
  vi.mocked(getFarmWorkCapabilities).mockResolvedValue(allCaps);
  vi.mocked(recordFarmWork).mockRejectedValueOnce(new FarmWorkRetryError());
  const selected = { ...task, id: 'seed-retry-depleted', action: 'Seed', requestId: 15 };
  await ready(selected); confirm();
  fireEvent.click(screen.getByRole('button', { name: 'Save completed work' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry same record' })).toBeEnabled());
  cleanup();
  vi.mocked(loadWorkSeedOptions).mockResolvedValue({ gramsPerTray: 20, batches: [] });
  const loads = vi.mocked(loadWorkSeedOptions).mock.calls.length;
  await ready(selected);
  expect(loadWorkSeedOptions).toHaveBeenCalledTimes(loads);
  expect(screen.getByLabelText('Trays seeded')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Retry same record' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry same record' }));
  await waitFor(() => expect(recordFarmWork).toHaveBeenCalledTimes(2));
  expect(vi.mocked(recordFarmWork).mock.calls[0][1]).toEqual(vi.mocked(recordFarmWork).mock.calls[1][1]);
});

it('does not restore another signed-in grower’s uncertain values for the same task', async () => {
  vi.mocked(getFarmWorkCapabilities).mockResolvedValue(allCaps);
  vi.mocked(recordFarmWork).mockRejectedValueOnce(new FarmWorkRetryError());
  localStorage.setItem('sproutify_session', JSON.stringify({ role: 'Owner', farmUuid: 'qa-farm', userId: 'owner-one' }));
  const selected = { ...task, id: 'retry-account-isolation', action: 'Water' };
  await ready(selected); fireEvent.click(screen.getByLabelText('All needed water')); confirm();
  fireEvent.click(screen.getByRole('button', { name: 'Save completed work' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry same record' })).toBeEnabled());
  cleanup();
  localStorage.setItem('sproutify_session', JSON.stringify({ role: 'Owner', farmUuid: 'qa-farm', userId: 'owner-two' }));
  await ready(selected);
  expect(screen.queryByRole('button', { name: 'Retry same record' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('No watering needed')).toBeEnabled();
  expect(screen.getByLabelText('All needed water')).not.toBeChecked();
});

it('restores durable original values after a page reload and fresh task progress, without creating another save', async () => {
  vi.mocked(getFarmWorkCapabilities).mockResolvedValue(allCaps);
  const original = { ...task, id:'seed-durable-reload',action:'Seed',requestId:15,trayIds:[],quantity:5,quantityCompleted:0,traysRemaining:5 };
  const input = {quantity:'2',batchId:'34',weight:'',trayIds:[]};
  const payload = {p_request_id:15,p_quantity:2,p_seedbatch_id:34,p_work_date:'2026-10-17'};
  const key = 'farm-work-operation:qa-farm:qa-owner:prepare:15';
  localStorage.setItem(key,JSON.stringify({id:crypto.randomUUID(),identity:'seed:15:2026-10-17:0',fingerprint:JSON.stringify(['record_seed_work',payload]),context:{task:original,input,options:seedOptions,date:'2026-10-17'}}));
  await ready({...original,quantityCompleted:2,traysRemaining:3});
  expect(screen.getByText(/Original unconfirmed record from 2026-10-17/)).toBeInTheDocument();
  expect(screen.getByLabelText('Trays seeded')).toHaveValue(2);
  expect(screen.getByLabelText('Trays seeded')).toBeDisabled();
  expect(loadWorkSeedOptions).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Retry same record'}));
  await waitFor(()=>expect(retryPendingFarmWork).toHaveBeenCalledWith(key));
  expect(recordFarmWork).not.toHaveBeenCalled();
});
