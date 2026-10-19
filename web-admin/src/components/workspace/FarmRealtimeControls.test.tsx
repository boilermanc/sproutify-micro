import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import FarmRealtimeControls from './FarmRealtimeControls';
import type { FarmRealtimeProps } from '@/hooks/useFarmRealtimeVoice';
const voice = vi.hoisted(() => ({ phase: 'off', error: '', start: vi.fn(), end: vi.fn() }));
vi.mock('@/hooks/useFarmRealtimeVoice', () => ({ useFarmRealtimeVoice: () => voice }));
const props: FarmRealtimeProps = { active: true, busy: false, identity: 'qa', history: [], onBusyChange: vi.fn(), onUser: vi.fn(), onAssistant: vi.fn(), readFarm: vi.fn(), reviewWork: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); voice.phase = 'off'; voice.error = ''; }); afterEach(cleanup);
it('offers a single compact accessible icon without a large voice section', () => {
  render(<FarmRealtimeControls {...props} />); const button = screen.getByRole('button', { name: 'Start voice conversation' });
  expect(button).toHaveTextContent(''); expect(button).toHaveAttribute('title', expect.stringContaining('AI-generated voice')); fireEvent.click(button); expect(voice.start).toHaveBeenCalledOnce();
});
it('keeps the End toggle available while connecting or speaking and explains barge-in', () => {
  voice.phase = 'speaking'; const view = render(<FarmRealtimeControls {...props} busy />);
  expect(screen.getByRole('status')).toHaveTextContent('Speaking · interrupt anytime'); const stop = screen.getByRole('button', { name: 'End voice conversation' }); expect(stop).toBeEnabled(); fireEvent.click(stop); expect(voice.end).toHaveBeenCalled();
  voice.phase = 'connecting'; view.rerender(<FarmRealtimeControls {...props} busy />); expect(screen.getByRole('button', { name: 'End voice conversation' })).toBeEnabled();
});
it('preserves a readable error and typing fallback after a connection failure', () => {
  voice.error = 'Voice could not connect. You can still type.'; render(<FarmRealtimeControls {...props} />); expect(screen.getByRole('alert')).toHaveTextContent('You can still type.');
});
