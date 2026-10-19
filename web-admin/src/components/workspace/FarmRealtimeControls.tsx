import { AudioLines, Square } from 'lucide-react';
import { useFarmRealtimeVoice, type FarmRealtimeProps } from '@/hooks/useFarmRealtimeVoice';
export default function FarmRealtimeControls(props: FarmRealtimeProps) {
  const voice = useFarmRealtimeVoice(props); const live = voice.phase !== 'off';
  const label = live ? 'End voice conversation' : 'Start voice conversation';
  const status = { off: '', connecting: 'Connecting voice…', listening: 'Listening · mic on', thinking: 'Thinking · mic on', speaking: 'Speaking · interrupt anytime' }[voice.phase];
  return <div className="farm-realtime-control">
    <button type="button" className={`farm-chat-voice-toggle ${live ? 'is-live' : ''}`} aria-label={label} aria-pressed={live}
      title={live ? `${status}. Click to end.` : 'Start voice · OpenAI audio · AI-generated voice'} disabled={!props.active || !live && props.busy} onClick={live ? voice.end : () => void voice.start()}>
      {live ? <Square size={16} /> : <AudioLines size={18} />}
    </button>
    {live && <span role="status" className="farm-realtime-status">{status}</span>}
    {voice.error && <span role="alert" className="farm-realtime-error">{voice.error}</span>}
  </div>;
}
