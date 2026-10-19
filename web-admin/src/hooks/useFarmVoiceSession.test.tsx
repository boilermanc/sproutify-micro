import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useFarmVoiceSession } from './useFarmVoiceSession';
const low = vi.hoisted(() => ({ capture: 'idle', speech: 'idle', error: '', start: vi.fn(), cancel: vi.fn(), playReply: vi.fn(), stopSpeaking: vi.fn(), transcript: null as null | ((text: string) => void) }));
vi.mock('./useFarmVoice', () => ({ useFarmVoice: (props: { onTranscript: (text: string) => void }) => { low.transcript = props.onTranscript; return low; } }));
const received = vi.fn(); const activity = vi.fn();
type Reply = { id: number; text: string } | null;
const initial = { active: true, busy: false, identity: 'farm-a', reply: null as Reply, review: false, spoken: true };
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); low.capture = 'idle'; low.speech = 'idle'; low.error = ''; });
afterEach(() => { cleanup(); vi.useRealTimers(); });
function open() { return renderHook(props => useFarmVoiceSession({ ...props, onTranscript: received, onBusyChange: activity }), { initialProps: initial }); }
it('waits for explicit Start and begins automatic capture without requiring a hold', () => {
  const hook = open(); expect(low.start).not.toHaveBeenCalled(); act(() => hook.result.current.begin());
  expect(hook.result.current.conversation).toBe(true); expect(low.start).toHaveBeenCalledExactlyOnceWith(true); expect(activity).toHaveBeenLastCalledWith(true);
});
it('waits for a reply, speaks it, and listens again only after playback ends', async () => {
  const hook = open(); act(() => hook.result.current.begin()); low.capture = 'recording'; hook.rerender(initial);
  act(() => low.transcript?.('Two radish trays.')); expect(received).toHaveBeenCalledWith('Two radish trays.', false);
  low.capture = 'idle'; hook.rerender({ ...initial, busy: true }); await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); expect(low.start).toHaveBeenCalledTimes(1);
  const reply = { id: 1, text: 'Draft, not saved. Two radish trays.' };
  low.speech = 'loading'; hook.rerender({ ...initial, reply }); expect(low.playReply).toHaveBeenCalledWith(reply.text);
  low.speech = 'playing'; hook.rerender({ ...initial, reply }); await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); expect(low.start).toHaveBeenCalledTimes(1);
  low.speech = 'ready'; hook.rerender({ ...initial, reply }); await act(async () => { await vi.advanceTimersByTimeAsync(450); }); expect(low.start).toHaveBeenCalledTimes(2);
});
it('End cancels capture and cannot automatically restart or speak a late answer', async () => {
  const hook = open(); act(() => hook.result.current.begin()); act(() => low.transcript?.('What next?')); hook.rerender({ ...initial, busy: true });
  act(() => hook.result.current.end()); expect(hook.result.current.conversation).toBe(false);
  hook.rerender({ ...initial, reply: { id: 1, text: 'Late answer.' } }); await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(low.start).toHaveBeenCalledTimes(1); expect(low.playReply).not.toHaveBeenCalled(); expect(low.cancel).toHaveBeenCalled();
});
it('ends on a farm change, backgrounding, close and provider errors', () => {
  const hook = open(); act(() => hook.result.current.begin()); hook.rerender({ ...initial, identity: 'farm-b' }); expect(hook.result.current.conversation).toBe(false);
  act(() => hook.result.current.begin()); act(() => window.dispatchEvent(new Event('blur'))); expect(hook.result.current.conversation).toBe(false);
  act(() => hook.result.current.begin()); low.error = 'Provider unavailable'; hook.rerender({ ...initial, identity: 'farm-b' }); expect(hook.result.current.conversation).toBe(false);
  low.error = ''; act(() => hook.result.current.begin()); hook.rerender({ ...initial, active: false }); expect(hook.result.current.conversation).toBe(false);
});
it('My turn interrupts audio and resumes listening after the speaker gap', async () => {
  const hook = open(); act(() => hook.result.current.begin()); act(() => low.transcript?.('What next?'));
  low.speech = 'playing'; hook.rerender({ ...initial, reply: { id: 1, text: 'Check radish.' } });
  act(() => hook.result.current.interrupt()); expect(low.stopSpeaking).toHaveBeenCalled(); low.speech = 'idle'; hook.rerender(initial);
  await act(async () => { await vi.advanceTimersByTimeAsync(450); }); expect(low.start).toHaveBeenCalledTimes(2);
});
it('recognizes an explicit spoken goodbye without sending another AI request', () => {
  const hook = open(); act(() => hook.result.current.begin()); act(() => low.transcript?.('Stop listening.'));
  expect(hook.result.current.conversation).toBe(false); expect(received).not.toHaveBeenCalled(); expect(low.cancel).toHaveBeenCalled();
});
it('releases the parent interaction lock and all restart timers on unmount', () => {
  const hook = open(); act(() => hook.result.current.begin()); expect(activity).toHaveBeenLastCalledWith(true);
  hook.unmount(); expect(activity).toHaveBeenLastCalledWith(false); expect(vi.getTimerCount()).toBe(0);
});
