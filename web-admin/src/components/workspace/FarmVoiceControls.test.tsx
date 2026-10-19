import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import FarmVoiceControls from './FarmVoiceControls';
const mock = vi.hoisted(() => ({ capture: 'idle', speech: 'idle', error: '', seconds: 0, start: vi.fn(), finish: vi.fn(), cancel: vi.fn(), playReply: vi.fn(), stopSpeaking: vi.fn(), transcript: null as null | ((text: string) => void) }));
vi.mock('@/hooks/useFarmVoice', () => ({ useFarmVoice: (props: { onTranscript: (text: string) => void }) => { mock.transcript = props.onTranscript; return mock; } }));
const props = { active: true, busy: false, identity: 'qa-farm', reply: null, onTranscript: vi.fn(), onBusyChange: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); mock.capture = 'idle'; mock.speech = 'idle'; mock.error = ''; vi.stubGlobal('PointerEvent', MouseEvent); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('starts only on explicit hold and finishes on release with keyboard access', () => {
  render(<FarmVoiceControls {...props} />); expect(mock.start).not.toHaveBeenCalled(); fireEvent.click(screen.getByText('Single message & voice options'));
  const talk = screen.getByRole('button', { name: 'Hold to talk' });
  fireEvent.pointerDown(talk, { button: 0 }); expect(mock.start).toHaveBeenCalledTimes(1);
  fireEvent.pointerUp(talk); expect(mock.finish).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(talk, { key: ' ' }); fireEvent.keyUp(talk, { key: ' ' }); expect(mock.start).toHaveBeenCalledTimes(2); expect(mock.finish).toHaveBeenCalledTimes(2);
});
it('supports tap controls without requiring a continuous hold', () => {
  const view = render(<FarmVoiceControls {...props} />); fireEvent.click(screen.getByText('Single message & voice options')); fireEvent.click(screen.getByRole('button', { name: 'Use tap controls' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start voice message' })); expect(mock.start).toHaveBeenCalledTimes(1);
  mock.capture = 'recording'; view.rerender(<FarmVoiceControls {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Finish voice message' })); expect(mock.finish).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel recording' })); expect(mock.cancel).toHaveBeenCalledTimes(1);
});
it('offers transcript review before sending the message to the farm', () => {
  render(<FarmVoiceControls {...props} />); fireEvent.click(screen.getByText('Single message & voice options')); fireEvent.click(screen.getByRole('checkbox', { name: 'Review single-message transcript first' }));
  mock.transcript?.('Two radish trays.'); expect(props.onTranscript).toHaveBeenCalledWith('Two radish trays.', true); expect(mock.start).not.toHaveBeenCalled();
});
it('speaks new replies once and respects the spoken-replies choice', () => {
  const view = render(<FarmVoiceControls {...props} />);
  const reply = { id: 1, text: 'Draft, not saved. Two radish trays.' };
  view.rerender(<FarmVoiceControls {...props} reply={reply} />); expect(mock.playReply).toHaveBeenCalledExactlyOnceWith(reply.text);
  view.rerender(<FarmVoiceControls {...props} reply={{ ...reply }} />); expect(mock.playReply).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Single message & voice options')); fireEvent.click(screen.getByRole('checkbox', { name: 'Spoken replies to typed messages' })); expect(mock.stopSpeaking).toHaveBeenCalled();
  view.rerender(<FarmVoiceControls {...props} reply={{ id: 2, text: 'Next steps.' }} />); expect(mock.playReply).toHaveBeenCalledTimes(1);
});
it('discloses the AI voice and prevents a new recording during an AI request', () => {
  render(<FarmVoiceControls {...props} busy />); expect(screen.getByRole('button', { name: 'Start conversation' })).toBeDisabled();
  expect(screen.getByText(/AI-generated voice/)).toBeInTheDocument();
});
it('offers a single Start conversation and an always-available End control', () => {
  const view = render(<FarmVoiceControls {...props} />); expect(screen.getByText('Single message & voice options').parentElement).not.toHaveAttribute('open');
  fireEvent.click(screen.getByRole('button', { name: 'Start conversation' })); expect(mock.start).toHaveBeenCalledWith(true);
  mock.capture = 'recording'; view.rerender(<FarmVoiceControls {...props} />); expect(screen.getByRole('status')).toHaveTextContent('Listening… · Microphone on');
  view.rerender(<FarmVoiceControls {...props} busy />); expect(screen.getByRole('button', { name: 'End conversation' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'End conversation' })); expect(mock.cancel).toHaveBeenCalled();
});
