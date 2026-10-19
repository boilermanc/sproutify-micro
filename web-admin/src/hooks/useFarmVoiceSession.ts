import { useCallback, useEffect, useRef, useState } from 'react';
import { useFarmVoice } from './useFarmVoice';

type Reply = { id: number; text: string } | null;
const ignoreBusy = () => {};
export function useFarmVoiceSession({ active, busy, identity, reply, onTranscript, onBusyChange, review, spoken }: {
  active: boolean; busy: boolean; identity: string; reply: Reply; review: boolean; spoken: boolean;
  onTranscript: (text: string, review: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [conversation, setConversation] = useState(false);
  const [turn, setTurn] = useState<'listen' | 'answer' | 'speak'>('listen');
  const session = useRef(false); const handled = useRef(reply?.id ?? -1); const suppressReply = useRef(false);
  const latest = useRef({ reply, busy, turn });
  useEffect(() => { latest.current = { reply, busy, turn }; }, [reply, busy, turn]);
  const voice = useFarmVoice({ active, busy, identity, onBusyChange: ignoreBusy, onTranscript: text => {
    if (session.current && /^(?:please\s+)?(?:end (?:the )?conversation|stop listening|goodbye)[.!?]*$/i.test(text.trim())) { end(); return; }
    if (session.current) { setTurn('answer'); onTranscript(text, false); }
    else onTranscript(text, review);
  } });
  const { cancel, capture, speech, error, start, playReply, stopSpeaking } = voice;
  const end = useCallback(() => {
    if (session.current && (latest.current.busy || latest.current.turn === 'answer')) suppressReply.current = true;
    session.current = false; setConversation(false); cancel();
  }, [cancel]);
  useEffect(() => { onBusyChange(conversation || capture !== 'idle'); }, [conversation, capture, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
  useEffect(() => { if (!active) end(); return end; }, [active, identity, end]);
  useEffect(() => {
    const leave = () => { if (document.visibilityState === 'hidden') end(); };
    const blur = () => { if (session.current) end(); };
    document.addEventListener('visibilitychange', leave); window.addEventListener('blur', blur);
    return () => { document.removeEventListener('visibilitychange', leave); window.removeEventListener('blur', blur); };
  }, [end]);
  useEffect(() => { if (error && session.current) end(); }, [error, end]);
  useEffect(() => {
    if (!active) { handled.current = reply?.id ?? -1; return; }
    if (!reply || reply.id === handled.current || busy) return;
    handled.current = reply.id;
    if (suppressReply.current) { suppressReply.current = false; return; }
    if (session.current) setTurn('speak');
    if ((session.current || spoken) && capture === 'idle') void playReply(reply.text);
  }, [active, busy, reply, spoken, capture, playReply]);
  useEffect(() => {
    if (conversation && turn === 'speak' && speech === 'ready' && !error) setTurn('listen');
  }, [conversation, turn, speech, error]);
  useEffect(() => {
    if (!conversation || !active || busy || turn !== 'listen' || capture !== 'idle' || speech === 'playing' || speech === 'loading' || error) return;
    const timer = setTimeout(() => { if (session.current) void start(true); }, 450);
    return () => clearTimeout(timer);
  }, [conversation, active, busy, turn, capture, speech, error, start]);
  const begin = () => {
    if (!active || busy || capture !== 'idle') return;
    handled.current = latest.current.reply?.id ?? -1; suppressReply.current = false;
    session.current = true; setConversation(true); setTurn('listen');
    void start(true);
  };
  const interrupt = () => { stopSpeaking(); setTurn('listen'); };
  return { ...voice, conversation, turn, begin, end, interrupt };
}
