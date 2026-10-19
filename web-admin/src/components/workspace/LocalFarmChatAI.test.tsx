import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LocalFarmChat from './LocalFarmChat';
import type { DailyTask } from '@/services/dailyFlowService';
import type { WorkInput } from './farmWorkActions';
import type { FarmRealtimeProps } from '@/hooks/useFarmRealtimeVoice';
const mocks = vi.hoisted(() => ({ read: vi.fn(), chat: vi.fn(), status: vi.fn(), voice: null as FarmRealtimeProps | null, review: null as null | { previewOnly?: boolean; initialInput?: Partial<WorkInput> } }));
vi.mock('@/services/workspaceTasks', () => ({ fetchGrowingWorkspace: mocks.read }));
vi.mock('./FarmRealtimeControls', () => ({ default: (props: FarmRealtimeProps) => { mocks.voice = props; return null; } }));
vi.mock('@/services/farmConversationAI', async original => ({ ...await original<typeof import('@/services/farmConversationAI')>(), converseWithFarm: mocks.chat, getFarmAIStatus: mocks.status }));
vi.mock('./FarmWorkDialog', () => ({ default: (props: { task: DailyTask | null; previewOnly?: boolean; initialInput?: Partial<WorkInput> }) => { if (!props.task) return null; mocks.review = props; return <div role="dialog">Shared review</div>; } }));
const task: DailyTask = { id: 'seed-1', action: 'Seed', crop: 'Radish', location: 'Rack A', batchId: 'N/A', dayCurrent: 0, dayTotal: 0, trays: 4, quantity: 4, quantityCompleted: 0, trayIds: [], recipeId: 1, requestId: 1, status: 'pending', taskSource: 'seed_request' };
const draft = () => ({ category: 'draft', message: 'I understand: two radish trays. Nothing has been saved.', candidateTaskIds: [], draftDisposition: 'replace', writesEnabled: false, proposal: { taskId: 'seed-1', kind: 'seed', quantity: 2, watering: 'unspecified', watered: false } });
beforeEach(() => {
  localStorage.clear(); localStorage.setItem('sproutify_session', JSON.stringify({ userId: 'qa-owner', farmUuid: 'qa-farm', role: 'Owner' }));
  mocks.read.mockReset().mockResolvedValue({ groups: [], tasks: [task] }); mocks.status.mockReset().mockResolvedValue(true); mocks.chat.mockReset().mockResolvedValue(draft()); mocks.review = null;
});
afterEach(cleanup);
function open() { render(<MemoryRouter initialEntries={['/today']}><LocalFarmChat /></MemoryRouter>); fireEvent.click(screen.getByRole('button', { name: 'Chat with your farm' })); }
function send(text: string) { fireEvent.change(screen.getByRole('textbox', { name: 'Message your farm' }), { target: { value: text } }); fireEvent.click(screen.getByRole('button', { name: 'Send message' })); }
it('accepts natural phrasing, labels the AI draft, and opens only a shared preview', async () => {
  open(); send('Just put down a couple of radish trays; what should I tackle next?'); await screen.findByText(/I understand: two radish trays/);
  expect(mocks.chat.mock.calls[0][0]).toContain('Just put down a couple'); expect(screen.getAllByText('Draft · not saved').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Review work form' })); await screen.findByRole('dialog');
  expect(mocks.review).toMatchObject({ previewOnly: true, initialInput: { quantity: '2' } });
});
it('passes conversation history and the unsaved draft for natural follow-up corrections', async () => {
  open(); send('A couple of radish trays are done'); await screen.findByText(/I understand/);
  mocks.chat.mockResolvedValue({ ...draft(), message: 'Three trays in the unsaved draft.', proposal: { ...draft().proposal, quantity: 3 } });
  send('Hang on, I meant three, not a couple'); await screen.findByText('Three trays in the unsaved draft.');
  expect(mocks.chat.mock.calls[1][2]).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'user', text: 'A couple of radish trays are done' })]));
  expect(mocks.chat.mock.calls[1][3]).toEqual({ taskId: 'seed-1', quantity: 2 });
  expect(screen.getByText('Unsaved draft · Radish · 3 trays')).toBeInTheDocument();
});
it('keeps an unsaved draft while answering a follow-up question', async () => {
  open(); send('Finished a couple radish trays'); await screen.findByText(/I understand/);
  mocks.chat.mockResolvedValue({ category: 'info', message: 'There are four planned trays; the proposal is still unsaved.', candidateTaskIds: [], proposal: null, draftDisposition: 'keep', writesEnabled: false });
  send('How many are planned altogether?'); await screen.findByText(/four planned trays/); expect(screen.getByText('Unsaved draft · Radish · 2 trays')).toBeInTheDocument();
});
it('uses labelled caution styling for provider failures without a fake answer or fallback', async () => {
  mocks.chat.mockRejectedValue(new Error('Local AI setup is incomplete. No work has been saved.')); open(); send('How is my farm doing?');
  const message = await screen.findByText(/Local AI setup is incomplete/); expect(message.parentElement).toHaveClass('farm-chat-tone-caution');
  expect(message.parentElement).toHaveTextContent('Needs attention'); expect(screen.queryByRole('button', { name: 'Review work form' })).not.toBeInTheDocument();
});
it.each(['info', 'next', 'clarify', 'draft', 'caution'])('renders the %s category with a text label as well as color', async category => {
  mocks.chat.mockResolvedValue({ category, message: `Test response ${category}`, candidateTaskIds: [], proposal: null, draftDisposition: 'keep', writesEnabled: false });
  open(); send('A natural question'); const message = await screen.findByText(`Test response ${category}`);
  expect(message.parentElement).toHaveClass(`farm-chat-tone-${category}`); expect(message.parentElement?.querySelector('.farm-chat-label')?.textContent).toBeTruthy();
});
it('does not display an AI answer after the farm changes while it is pending', async () => {
  let resolve: (value: unknown) => void = () => {};
  mocks.chat.mockReturnValue(new Promise(done => { resolve = done; })); open(); send('What should I do now?'); await waitFor(() => expect(mocks.chat).toHaveBeenCalled());
  localStorage.setItem('sproutify_session', JSON.stringify({ userId: 'different', farmUuid: 'other', role: 'Owner' })); resolve(draft());
  await waitFor(() => expect(screen.getByRole('button', { name: 'Use simple commands' })).not.toBeDisabled()); expect(screen.queryByText(/I understand/)).not.toBeInTheDocument();
});
it('routes a voice transcript through the same AI draft and locked work review', async () => {
  open(); await waitFor(() => expect(mocks.voice?.reviewWork).toBeTypeOf('function'));
  act(() => mocks.voice?.onUser('I just seeded two radish trays.'));
  await act(async () => { const answer = await mocks.voice!.reviewWork('I just seeded two radish trays.', new AbortController().signal); mocks.voice!.onAssistant(answer.message, answer.category); });
  await screen.findByText(/I understand: two radish trays/); expect(mocks.chat.mock.calls[0][0]).toBe('I just seeded two radish trays.');
  fireEvent.click(screen.getByRole('button', { name: 'Review work form' })); await screen.findByRole('dialog'); expect(mocks.review?.previewOnly).toBe(true);
});
it('refuses a voice draft after the session has been interrupted or ended', async () => {
  open(); await waitFor(() => expect(mocks.voice?.reviewWork).toBeTypeOf('function'));
  const controller = new AbortController(); controller.abort();
  await expect(mocks.voice!.reviewWork('I seeded three radish trays.', controller.signal)).rejects.toThrow(/Voice farm changed/);
  expect(mocks.chat).not.toHaveBeenCalled(); expect(screen.queryByText(/Unsaved draft ·/)).not.toBeInTheDocument();
});
