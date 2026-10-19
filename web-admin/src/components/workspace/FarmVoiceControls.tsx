import { useState } from 'react';
import { Mic, Square, Volume2 } from 'lucide-react';
import { useFarmVoiceSession } from '@/hooks/useFarmVoiceSession';

interface Props {
  active: boolean; busy: boolean; identity: string;
  reply: { id: number; text: string } | null;
  onTranscript: (text: string, review: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}
export default function FarmVoiceControls(props: Props) {
  const [review, setReview] = useState(false);
  const [spoken, setSpoken] = useState(true);
  const [tap, setTap] = useState(false);
  const voice = useFarmVoiceSession({ ...props, review, spoken });
  const recording = voice.capture === 'recording'; const pending = voice.capture === 'permission';
  const transcribing = voice.capture === 'transcribing';
  const status = pending ? 'Allow microphone access…' : transcribing ? 'Transcribing…' : props.busy || voice.conversation && voice.turn === 'answer' ? 'Thinking…'
    : voice.speech === 'loading' ? 'Preparing reply…' : voice.speech === 'playing' ? 'Speaking…' : recording ? 'Listening…' : 'Getting ready…';
  return <div className="farm-voice-controls" aria-label="Farm voice controls">
    <div className="farm-voice-buttons">
      <button type="button" className={`farm-voice-talk ${voice.conversation ? 'is-recording' : ''}`} aria-describedby="farm-voice-help"
        disabled={!props.active || !voice.conversation && (props.busy || voice.capture !== 'idle')}
        onClick={voice.conversation ? voice.end : voice.begin}>{voice.conversation ? <Square size={16} /> : <Mic size={16} />}{voice.conversation ? 'End conversation' : 'Start conversation'}</button>
      {voice.conversation && (voice.speech === 'playing' || voice.speech === 'loading') && <button type="button" onClick={voice.interrupt}>My turn</button>}
      {!voice.conversation && props.reply && voice.capture === 'idle' && (voice.speech === 'playing' || voice.speech === 'loading'
        ? <button type="button" onClick={() => voice.stopSpeaking()}>Stop speaking</button>
        : <button type="button" disabled={props.busy} onClick={() => void voice.playReply(props.reply!.text)}><Volume2 size={15} />Play reply</button>)}
    </div>
    {voice.conversation && <p role="status" className="farm-voice-session-status">{status}{recording ? ' · Microphone on' : ' · Microphone off'}</p>}
    <p id="farm-voice-help">{voice.conversation ? recording ? 'Talk naturally. Pause briefly when you’re done; I’ll answer and listen again.' : 'Your microphone pauses while I answer, then listens again. End conversation stops the session.' : 'Start once, talk naturally, and pause for a reply. Audio goes to OpenAI; replies use an AI-generated voice.'}</p>
    {!voice.conversation && <details className="farm-voice-options"><summary>Single message & voice options</summary>
      <label><input type="checkbox" checked={spoken} onChange={event => { setSpoken(event.target.checked); if (!event.target.checked) voice.stopSpeaking(); }} /> Spoken replies to typed messages</label>
      <label><input type="checkbox" checked={review} onChange={event => setReview(event.target.checked)} /> Review single-message transcript first</label>
      <div className="farm-voice-buttons">
        <button type="button" className={`farm-voice-talk ${recording ? 'is-recording' : ''}`} disabled={!props.active || props.busy || transcribing}
          onPointerDown={event => { if (tap || event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); void voice.start(); }}
          onPointerUp={() => { if (!tap) voice.finish(); }} onPointerCancel={voice.cancel}
          onKeyDown={event => { if (!tap && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); if (!event.repeat) void voice.start(); } }}
          onKeyUp={event => { if (!tap && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); voice.finish(); } }}
          onClick={() => { if (tap) { if (recording || pending) voice.finish(); else void voice.start(); } }}>
          {transcribing ? 'Transcribing…' : pending ? 'Waiting for microphone…' : recording ? tap ? 'Finish voice message' : `Release to send · ${voice.seconds}s` : tap ? 'Start voice message' : 'Hold to talk'}
        </button>
        {voice.capture !== 'idle' && <button type="button" onClick={voice.cancel}>Cancel recording</button>}
        <button type="button" disabled={voice.capture !== 'idle'} onClick={() => setTap(value => !value)}>{tap ? 'Use hold controls' : 'Use tap controls'}</button>
      </div>
      <p>Up to 60 seconds per message. {recording ? 'Microphone on.' : 'Microphone off.'}</p>
    </details>}
    {voice.error && <p role="alert" className="farm-voice-error">{voice.error}</p>}
  </div>;
}
