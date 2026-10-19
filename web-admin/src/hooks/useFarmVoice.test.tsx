import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useFarmVoice } from './useFarmVoice';
import { fetchSpokenReply, transcribeVoice } from '@/services/farmVoice';
vi.mock('@/services/farmVoice', () => ({ fetchSpokenReply: vi.fn(), transcribeVoice: vi.fn() }));
const devices = { getUserMedia: vi.fn() };
const tracks: Array<{ stop: ReturnType<typeof vi.fn> }> = [];
function media() { const track = { stop: vi.fn() }; tracks.push(track); return { getTracks: () => [track] } as unknown as MediaStream; }
class Recorder {
  static instances: Recorder[] = [];
  static isTypeSupported = () => true;
  state = 'inactive'; mimeType = 'audio/webm';
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { Recorder.instances.push(this); }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['test voice'], { type: this.mimeType }) } as BlobEvent); queueMicrotask(() => this.onstop?.()); }
}
class AudioMock {
  static instances: AudioMock[] = [];
  pause = vi.fn(); play = vi.fn().mockResolvedValue(undefined); currentTime = 0;
  onended: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor() { AudioMock.instances.push(this); }
}
const received = vi.fn(); const activity = vi.fn();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
  vi.clearAllMocks(); tracks.length = 0; Recorder.instances = []; AudioMock.instances = [];
  devices.getUserMedia.mockReset().mockImplementation(async () => media());
  vi.stubGlobal('navigator', { mediaDevices: devices }); vi.stubGlobal('MediaRecorder', Recorder); vi.stubGlobal('Audio', AudioMock);
  vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:test-reply'), revokeObjectURL: vi.fn() });
  vi.mocked(transcribeVoice).mockReset().mockResolvedValue('I seeded two radish trays.');
  vi.mocked(fetchSpokenReply).mockReset().mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function open() { return renderHook(({ active = true, busy = false, identity = 'farm-a' }) => useFarmVoice({ active, busy, identity, onTranscript: received, onBusyChange: activity }), { initialProps: { active: true, busy: false, identity: 'farm-a' } }); }
async function record(hook: ReturnType<typeof open>) { await act(async () => { await hook.result.current.start(); }); expect(hook.result.current.capture).toBe('recording'); }
it('records only on request, stops every track on release, and sends the transcript once', async () => {
  const hook = open(); expect(devices.getUserMedia).not.toHaveBeenCalled(); await record(hook);
  await act(async () => { await vi.advanceTimersByTimeAsync(900); hook.result.current.finish(); });
  expect(tracks[0].stop).toHaveBeenCalled(); expect(transcribeVoice).toHaveBeenCalledTimes(1); expect(received).toHaveBeenCalledExactlyOnceWith('I seeded two radish trays.'); expect(hook.result.current.capture).toBe('idle');
});
it('does not record after a permission prompt resolves following an early release', async () => {
  let allow: (stream: MediaStream) => void = () => {};
  devices.getUserMedia.mockReturnValue(new Promise(resolve => { allow = resolve; })); const hook = open();
  act(() => { void hook.result.current.start(); }); expect(hook.result.current.capture).toBe('permission'); act(() => hook.result.current.finish());
  await act(async () => { allow(media()); }); expect(tracks[0].stop).toHaveBeenCalled(); expect(Recorder.instances).toHaveLength(0); expect(transcribeVoice).not.toHaveBeenCalled();
});
it('reports denied permission without disabling typing or sending any recording', async () => {
  devices.getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError')); const hook = open();
  await act(async () => { await hook.result.current.start(); }); expect(hook.result.current.error).toMatch(/permission was denied/); expect(hook.result.current.capture).toBe('idle'); expect(received).not.toHaveBeenCalled();
});
it('rejects a brief empty turn rather than sending it', async () => {
  const hook = open(); await record(hook); await act(async () => hook.result.current.finish()); expect(hook.result.current.error).toMatch(/little longer/); expect(transcribeVoice).not.toHaveBeenCalled();
});
it('cancels and discards active recording when chat closes', async () => {
  const hook = open(); await record(hook); await act(async () => hook.rerender({ active: false, busy: false, identity: 'farm-a' }));
  expect(tracks[0].stop).toHaveBeenCalled(); expect(transcribeVoice).not.toHaveBeenCalled(); expect(received).not.toHaveBeenCalled();
});
it('ignores transcription after a farm change even if a provider ignores abort', async () => {
  let resolveText: (text: string) => void = () => {};
  vi.mocked(transcribeVoice).mockReturnValue(new Promise(resolve => { resolveText = resolve; })); const hook = open(); await record(hook);
  await act(async () => { await vi.advanceTimersByTimeAsync(800); hook.result.current.finish(); }); expect(hook.result.current.capture).toBe('transcribing');
  act(() => hook.rerender({ active: true, busy: false, identity: 'farm-b' }));
  await act(async () => resolveText('stale farm report')); expect(received).not.toHaveBeenCalled(); expect(vi.mocked(transcribeVoice).mock.calls[0][2].aborted).toBe(true);
});
it('an old recorder stop cannot stop a newer microphone stream', async () => {
  const hook = open(); await record(hook); const old = Recorder.instances[0].onstop; Recorder.instances[0].onstop = null;
  act(() => hook.result.current.cancel()); await record(hook); await act(async () => { old?.(); });
  expect(tracks[1].stop).not.toHaveBeenCalled(); expect(hook.result.current.capture).toBe('recording');
});
it('automatically finishes a 60-second recording and leaves no hot microphone', async () => {
  const hook = open(); await record(hook); await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(tracks[0].stop).toHaveBeenCalled(); expect(vi.mocked(transcribeVoice).mock.calls[0][1]).toBe(60000); expect(received).toHaveBeenCalledTimes(1);
});
it('interruption stops speech before opening the microphone', async () => {
  const hook = open(); await act(async () => hook.result.current.playReply('Next steps. Check the radish.')); expect(hook.result.current.speech).toBe('playing');
  await record(hook); expect(AudioMock.instances[0].pause).toHaveBeenCalled(); expect(hook.result.current.speech).toBe('idle');
});
it('reuses prepared speech for replay instead of making a second provider request', async () => {
  const hook = open(); await act(async () => hook.result.current.playReply('Nothing has been saved.'));
  act(() => hook.result.current.stopSpeaking()); await act(async () => hook.result.current.playReply('Nothing has been saved.'));
  expect(fetchSpokenReply).toHaveBeenCalledTimes(1); expect(AudioMock.instances[0].play).toHaveBeenCalledTimes(2);
});
it('does not create or play audio after close while speech is loading', async () => {
  let resolveAudio: (audio: Blob) => void = () => {};
  vi.mocked(fetchSpokenReply).mockReturnValue(new Promise(resolve => { resolveAudio = resolve; })); const hook = open();
  act(() => { void hook.result.current.playReply('Next steps.'); }); act(() => hook.rerender({ active: false, busy: false, identity: 'farm-a' }));
  await act(async () => resolveAudio(new Blob(['late'], { type: 'audio/mpeg' }))); expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('cleans up tracks, pending requests, timers and playback on unmount', async () => {
  const hook = open(); await act(async () => hook.result.current.playReply('Next steps.')); await record(hook); hook.unmount();
  expect(tracks[0].stop).toHaveBeenCalled(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-reply'); expect(vi.getTimerCount()).toBe(0);
});
it('does not transmit an unexpected recorder stop as a completed voice message', async () => {
  const hook = open(); await record(hook); await act(async () => { await vi.advanceTimersByTimeAsync(900); Recorder.instances[0].stop(); });
  expect(hook.result.current.error).toMatch(/stopped unexpectedly/); expect(transcribeVoice).not.toHaveBeenCalled();
});

class ContextMock {
  static level = 0; static instances: ContextMock[] = [];
  state = 'running'; source = { connect: vi.fn(), disconnect: vi.fn() };
  close = vi.fn(async () => { this.state = 'closed'; }); resume = vi.fn(async () => {});
  constructor() { ContextMock.instances.push(this); }
  createMediaStreamSource() { return this.source; }
  createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: (values: Float32Array) => values.fill(ContextMock.level) }; }
}
function automaticAudio() { ContextMock.level = 0; ContextMock.instances = []; vi.stubGlobal('AudioContext', ContextMock); }
it('automatically sends sustained speech after a pause, then turns the microphone off', async () => {
  automaticAudio(); const hook = open(); await act(async () => { await hook.result.current.start(true); });
  ContextMock.level = .05; await act(async () => { await vi.advanceTimersByTimeAsync(800); }); expect(received).not.toHaveBeenCalled();
  ContextMock.level = 0; await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
  expect(received).toHaveBeenCalledExactlyOnceWith('I seeded two radish trays.'); expect(tracks[0].stop).toHaveBeenCalled();
  expect(ContextMock.instances[0].close).toHaveBeenCalled(); expect(ContextMock.instances[0].source.disconnect).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it('ends automatic listening after silence without sending audio to a provider', async () => {
  automaticAudio(); const hook = open(); await act(async () => { await hook.result.current.start(true); await vi.advanceTimersByTimeAsync(20080); });
  expect(hook.result.current.error).toMatch(/No speech detected/); expect(transcribeVoice).not.toHaveBeenCalled(); expect(tracks[0].stop).toHaveBeenCalled();
});
it('releases automatic audio detection when ending before microphone permission resolves', async () => {
  automaticAudio(); let allow: (value: MediaStream) => void = () => {};
  devices.getUserMedia.mockReturnValue(new Promise(resolve => { allow = resolve; })); const hook = open();
  act(() => { void hook.result.current.start(true); }); act(() => hook.result.current.cancel());
  await act(async () => { allow(media()); }); expect(ContextMock.instances[0].close).toHaveBeenCalled(); expect(tracks[0].stop).toHaveBeenCalled(); expect(Recorder.instances).toHaveLength(0);
});
it('fails visibly instead of pretending a suspended detector is listening', async () => {
  automaticAudio(); const hook = open(); await act(async () => { await hook.result.current.start(true); });
  ContextMock.instances[0].state = 'suspended'; await act(async () => { await vi.advanceTimersByTimeAsync(80); });
  expect(hook.result.current.error).toMatch(/Audio detection paused/); expect(transcribeVoice).not.toHaveBeenCalled(); expect(tracks[0].stop).toHaveBeenCalled();
});
