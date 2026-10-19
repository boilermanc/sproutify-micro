import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useFarmRealtimeVoice, type FarmRealtimeProps } from './useFarmRealtimeVoice';
import { negotiateFarmVoice } from '@/services/farmRealtimeVoice';
vi.mock('@/services/farmRealtimeVoice', () => ({ negotiateFarmVoice: vi.fn() }));
class Channel {
  readyState = 'open'; send = vi.fn(); close = vi.fn();
  onopen: (() => void) | null = null; onclose: (() => void) | null = null; onmessage: ((event: { data: string }) => Promise<void>) | null = null;
}
class Peer {
  static instances: Peer[] = []; channel = new Channel(); connectionState = 'new';
  ontrack: ((event: { streams: MediaStream[]; track: MediaStreamTrack }) => void) | null = null; onconnectionstatechange: (() => void) | null = null;
  createDataChannel = () => this.channel; addTrack = vi.fn(); close = vi.fn();
  createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'v=0\nm=audio' })); setLocalDescription = vi.fn(); setRemoteDescription = vi.fn();
  constructor() { Peer.instances.push(this); }
}
class Playback {
  static instances: Playback[] = []; muted = false; autoplay = false; srcObject: unknown = null;
  onplaying = null; onerror: (() => void) | null = null; pause = vi.fn(); play = vi.fn().mockResolvedValue(undefined);
  constructor() { Playback.instances.push(this); }
}
const track = { enabled: true, stop: vi.fn() }; const media = { getTracks: () => [track], getAudioTracks: () => [track] };
const devices = { getUserMedia: vi.fn() };
const base: FarmRealtimeProps = { active: true, busy: false, identity: 'farm-a', history: [], onBusyChange: vi.fn(), onUser: vi.fn(), onAssistant: vi.fn(), readFarm: vi.fn(), reviewWork: vi.fn() };
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); Peer.instances = []; Playback.instances = []; track.enabled = true;
  vi.stubGlobal('RTCPeerConnection', Peer); vi.stubGlobal('Audio', Playback); vi.stubGlobal('navigator', { mediaDevices: devices });
  devices.getUserMedia.mockReset().mockResolvedValue(media); vi.mocked(negotiateFarmVoice).mockReset().mockResolvedValue('v=0\nm=audio');
  vi.mocked(base.readFarm).mockReset().mockResolvedValue({ tasks: [], groups: [], writesEnabled: false }); vi.mocked(base.reviewWork).mockReset();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function open() { return renderHook(props => useFarmRealtimeVoice(props), { initialProps: base }); }
async function begin(hook: ReturnType<typeof open>) { await act(async () => { await hook.result.current.start(); Peer.instances[0].channel.onopen?.(); }); }
async function event(data: unknown) { await act(async () => { await Peer.instances[0].channel.onmessage?.({ data: JSON.stringify(data) }); }); }
it('connects only after explicit action and never pauses the microphone during native speech', async () => {
  const hook = open(); expect(devices.getUserMedia).not.toHaveBeenCalled(); await begin(hook);
  await event({ type: 'output_audio_buffer.started' }); expect(hook.result.current.phase).toBe('speaking'); expect(track.enabled).toBe(true); expect(track.stop).not.toHaveBeenCalled();
  await event({ type: 'input_audio_buffer.speech_started' }); expect(hook.result.current.phase).toBe('listening'); expect(Playback.instances[0].muted).toBe(true); expect(track.stop).not.toHaveBeenCalled();
  await event({ type: 'output_audio_buffer.started' }); expect(Playback.instances[0].muted).toBe(false);
});
it('deduplicates transcripts and labels an interrupted assistant turn', async () => {
  const hook = open(); await begin(hook); await event({ type: 'response.created', response: { id: 'r1' } }); await event({ type: 'output_audio_buffer.started' });
  await event({ type: 'input_audio_buffer.speech_started' }); await event({ type: 'response.output_audio_transcript.done', item_id: 'a1', response_id: 'r1', transcript: 'Check the radish.' });
  expect(base.onAssistant).toHaveBeenCalledWith('Check the radish.\n(Interrupted)', 'info');
  for (let i = 0; i < 2; i++) await event({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'Actually three trays.' });
  expect(base.onUser).toHaveBeenCalledExactlyOnceWith('Actually three trays.');
});
it('executes only bounded read-only tools and returns their result before requesting speech', async () => {
  const hook = open(); await begin(hook);
  await event({ type: 'response.function_call_arguments.done', call_id: 'c1', name: 'read_farm', arguments: '{}' });
  expect(base.readFarm).toHaveBeenCalledOnce(); const sent = Peer.instances[0].channel.send.mock.calls.map(([text]) => JSON.parse(text));
  expect(sent.at(-2)).toMatchObject({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: 'c1' } }); expect(sent.at(-1)).toEqual({ type: 'response.create' });
  await event({ type: 'response.function_call_arguments.done', call_id: 'c2', name: 'delete_farm', arguments: '{}' }); expect(base.reviewWork).not.toHaveBeenCalled();
  await event({ type: 'response.function_call_arguments.done', call_id: 'c3', name: 'review_farm_work', arguments: JSON.stringify({ report: 'x'.repeat(1001) }) }); expect(base.reviewWork).not.toHaveBeenCalled();
});
it('aborts an old tool when the grower interrupts and does not restart its old response', async () => {
  let finish: (value: unknown) => void = () => {};
  vi.mocked(base.readFarm).mockImplementation(() => new Promise(resolve => { finish = resolve; })); const hook = open(); await begin(hook);
  let pending: Promise<void> | undefined;
  act(() => { pending = Peer.instances[0].channel.onmessage?.({ data: JSON.stringify({ type: 'response.function_call_arguments.done', call_id: 'c1', name: 'read_farm', arguments: '{}' }) }); });
  await event({ type: 'input_audio_buffer.speech_started' }); expect(vi.mocked(base.readFarm).mock.calls[0][0].aborted).toBe(true);
  const before = Peer.instances[0].channel.send.mock.calls.filter(([value]) => JSON.parse(value).type === 'response.create').length;
  await act(async () => { finish({ tasks: [] }); await pending; });
  expect(Peer.instances[0].channel.send.mock.calls.filter(([value]) => JSON.parse(value).type === 'response.create')).toHaveLength(before);
});
it('End releases tracks, peer, output audio, pending requests and timers', async () => {
  const hook = open(); await begin(hook); act(() => hook.result.current.end());
  expect(track.stop).toHaveBeenCalled(); expect(Peer.instances[0].close).toHaveBeenCalled(); expect(Playback.instances[0].pause).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); expect(base.onBusyChange).toHaveBeenLastCalledWith(false);
});
it('cannot start a late microphone after cancellation during permission', async () => {
  let allow: (value: typeof media) => void = () => {}; devices.getUserMedia.mockReturnValue(new Promise(resolve => { allow = resolve; })); const hook = open();
  act(() => { void hook.result.current.start(); }); act(() => window.dispatchEvent(new Event('blur'))); expect(hook.result.current.phase).toBe('connecting');
  act(() => hook.result.current.end()); await act(async () => allow(media));
  expect(track.stop).toHaveBeenCalled(); expect(negotiateFarmVoice).not.toHaveBeenCalled();
});
it('cleans up on farm change, visibility loss, timeout and unavailable saves', async () => {
  const hook = open(); await begin(hook); hook.rerender({ ...base, identity: 'farm-b' }); expect(hook.result.current.phase).toBe('off');
  await act(async () => { await hook.result.current.start(); Peer.instances[1].channel.onopen?.(); }); await act(async () => { await vi.advanceTimersByTimeAsync(90000); }); expect(hook.result.current.error).toMatch(/90 seconds/);
});
it('rejects a spoken write claim without adding a false success to chat', async () => {
  const hook = open(); await begin(hook); await event({ type: 'response.output_audio_transcript.done', item_id: 'bad', transcript: 'I saved two trays.' });
  expect(hook.result.current.phase).toBe('off'); expect(hook.result.current.error).toMatch(/No farm records were changed/); expect(base.onAssistant).not.toHaveBeenCalled();
});
it('stops the microphone after a rejected voice handshake', async () => {
  vi.mocked(negotiateFarmVoice).mockRejectedValue(new Error('Voice authorization failed.'));
  const hook = open(); await act(async () => { await hook.result.current.start(); });
  expect(hook.result.current.phase).toBe('off'); expect(hook.result.current.error).toMatch(/authorization failed/); expect(track.stop).toHaveBeenCalled();
});
it('ignores a late SDP answer after End and aborts the local negotiation', async () => {
  let answer: (value: string) => void = () => {}; vi.mocked(negotiateFarmVoice).mockReturnValue(new Promise(resolve => { answer = resolve; })); const hook = open();
  let pending: Promise<void> | undefined; await act(async () => { pending = hook.result.current.start(); }); expect(negotiateFarmVoice).toHaveBeenCalled();
  act(() => hook.result.current.end()); expect(vi.mocked(negotiateFarmVoice).mock.calls[0][1].aborted).toBe(true);
  await act(async () => { answer('v=0\nm=audio'); await pending; }); expect(Peer.instances[0].setRemoteDescription).not.toHaveBeenCalled();
});
it('aborts draft review on interruption without carrying its category into the new turn', async () => {
  let finish: (value: Awaited<ReturnType<FarmRealtimeProps['reviewWork']>>) => void = () => {};
  vi.mocked(base.reviewWork).mockReturnValue(new Promise(resolve => { finish = resolve; })); const hook = open(); await begin(hook);
  let pending: Promise<void> | undefined;
  act(() => { pending = Peer.instances[0].channel.onmessage?.({ data: JSON.stringify({ type: 'response.function_call_arguments.done', call_id: 'd1', name: 'review_farm_work', arguments: JSON.stringify({ report: 'Two radish trays.' }) }) }); });
  await event({ type: 'input_audio_buffer.speech_started' }); expect(vi.mocked(base.reviewWork).mock.calls[0][1].aborted).toBe(true);
  await act(async () => { finish({ category: 'draft', message: 'Unsaved.', writesEnabled: false, candidateTaskIds: [], proposal: null, draftDisposition: 'keep' }); await pending; });
  await event({ type: 'response.output_audio_transcript.done', item_id: 'new', transcript: 'What would you like to check?' }); expect(base.onAssistant).toHaveBeenCalledWith('What would you like to check?', 'info');
});
it('stops listening on backgrounding instead of leaving a hidden active call', async () => {
  const hook = open(); await begin(hook); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  act(() => document.dispatchEvent(new Event('visibilitychange'))); expect(hook.result.current.phase).toBe('off'); expect(track.stop).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
