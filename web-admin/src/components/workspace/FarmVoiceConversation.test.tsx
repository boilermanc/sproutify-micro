import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import FarmVoiceControls from './FarmVoiceControls';
import { fetchSpokenReply, transcribeVoice } from '@/services/farmVoice';
vi.mock('@/services/farmVoice', () => ({ fetchSpokenReply: vi.fn(), transcribeVoice: vi.fn() }));
class Recorder {
  static isTypeSupported = () => true;
  state = 'inactive'; mimeType = 'audio/webm';
  ondataavailable: ((event: BlobEvent) => void) | null = null; onstop: (() => void) | null = null;
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['synthetic voice']) } as BlobEvent); queueMicrotask(() => this.onstop?.()); }
}
class Context {
  static level = 0; state = 'running'; resume = async () => {}; close = async () => { this.state = 'closed'; };
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: (values: Float32Array) => values.fill(Context.level) }; }
}
class Playback {
  static instance: Playback; currentTime = 0; play = vi.fn().mockResolvedValue(undefined); pause = vi.fn();
  onended: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor() { Playback.instance = this; }
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('completes two automatic listening turns with a spoken reply between them and stops after End', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
  const tracks: Array<{ stop: ReturnType<typeof vi.fn> }> = [];
  const mic = vi.fn(async () => { const track = { stop: vi.fn() }; tracks.push(track); return { getTracks: () => [track] }; });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: mic } }); vi.stubGlobal('MediaRecorder', Recorder); vi.stubGlobal('AudioContext', Context); vi.stubGlobal('Audio', Playback);
  vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:synthetic-reply'), revokeObjectURL: vi.fn() });
  vi.mocked(transcribeVoice).mockResolvedValueOnce('I seeded two radish trays.').mockResolvedValueOnce('Actually three trays.');
  vi.mocked(fetchSpokenReply).mockResolvedValue(new Blob(['synthetic reply'], { type: 'audio/mpeg' }));
  const props = { active: true, busy: false, identity: 'qa-farm', reply: null as { id: number; text: string } | null, onTranscript: vi.fn(), onBusyChange: vi.fn() };
  const view = render(<FarmVoiceControls {...props} />); expect(mic).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start conversation' })); });
  expect(screen.getByRole('status')).toHaveTextContent('Listening… · Microphone on');
  async function say() {
    Context.level = .05; await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    Context.level = 0; await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
  }
  await say(); expect(props.onTranscript).toHaveBeenLastCalledWith('I seeded two radish trays.', false); expect(tracks[0].stop).toHaveBeenCalled();
  view.rerender(<FarmVoiceControls {...props} busy />); expect(screen.getByRole('status')).toHaveTextContent('Thinking… · Microphone off');
  await act(async () => { view.rerender(<FarmVoiceControls {...props} reply={{ id: 1, text: 'Draft, not saved. Two radish trays.' }} />); });
  expect(screen.getByRole('status')).toHaveTextContent('Speaking… · Microphone off'); expect(Playback.instance.play).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); expect(mic).toHaveBeenCalledTimes(1);
  await act(async () => { Playback.instance.onended?.(); }); await act(async () => { await vi.advanceTimersByTimeAsync(450); });
  expect(screen.getByRole('status')).toHaveTextContent('Listening… · Microphone on'); expect(mic).toHaveBeenCalledTimes(2);
  await say(); expect(props.onTranscript).toHaveBeenLastCalledWith('Actually three trays.', false); expect(tracks[1].stop).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'End conversation' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); }); expect(mic).toHaveBeenCalledTimes(2); expect(screen.getByRole('button', { name: 'Start conversation' })).toBeEnabled();
  expect(transcribeVoice).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
});
