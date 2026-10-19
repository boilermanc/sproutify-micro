import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSpokenReply, transcribeVoice } from '@/services/farmVoice';
import { createFarmVoiceActivity } from '@/lib/farmVoiceActivity';

type CaptureState = 'idle' | 'permission' | 'recording' | 'transcribing';
const maxBytes = 5 * 1024 * 1024;
export function useFarmVoice({ active, busy, identity, onTranscript, onBusyChange }: {
  active: boolean; busy: boolean; identity: string; onTranscript: (text: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [capture, setCapture] = useState<CaptureState>('idle');
  const [speech, setSpeech] = useState<'idle' | 'loading' | 'playing' | 'ready'>('idle');
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const current = useRef({ active, busy, identity, onTranscript, onBusyChange });
  const alive = useRef(true);
  const captureState = useRef<CaptureState>('idle');
  const captureId = useRef(0);
  const speechId = useRef(0);
  const wanted = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcription = useRef<AbortController | null>(null);
  const synthesis = useRef<AbortController | null>(null);
  const clip = useRef<{ text: string; url: string; audio: HTMLAudioElement } | null>(null);
  const detector = useRef<{ context: AudioContext; source: MediaStreamAudioSourceNode | null; timer: ReturnType<typeof setInterval> | null } | null>(null);
  useEffect(() => { current.current = { active, busy, identity, onTranscript, onBusyChange }; }, [active, busy, identity, onTranscript, onBusyChange]);
  const state = useCallback((value: CaptureState) => { captureState.current = value; if (alive.current) setCapture(value); current.current.onBusyChange(value !== 'idle'); }, []);
  const stopTracks = useCallback(() => {
    if (detector.current) {
      if (detector.current.timer) clearInterval(detector.current.timer);
      detector.current.source?.disconnect(); void detector.current.context.close().catch(() => {}); detector.current = null;
    }
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (timer.current) clearTimeout(timer.current); if (ticker.current) clearInterval(ticker.current);
    timer.current = null; ticker.current = null;
  }, []);
  const stopSpeaking = useCallback((release = false) => {
    speechId.current++; synthesis.current?.abort(); synthesis.current = null;
    if (clip.current) {
      clip.current.audio.pause(); clip.current.audio.currentTime = 0;
      if (release) { clip.current.audio.onended = null; clip.current.audio.onerror = null; URL.revokeObjectURL(clip.current.url); clip.current = null; }
    }
    if (alive.current) setSpeech('idle');
  }, []);
  const cancel = useCallback(() => {
    captureId.current++; wanted.current = false; transcription.current?.abort(); transcription.current = null;
    if (recorder.current?.state === 'recording') recorder.current.stop(); recorder.current = null;
    stopTracks(); stopSpeaking(true); state('idle');
  }, [state, stopTracks, stopSpeaking]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; cancel(); };
  }, [cancel]);
  useEffect(() => { if (!active) cancel(); return cancel; }, [active, identity, cancel]);
  useEffect(() => { if (busy) stopSpeaking(); }, [busy, stopSpeaking]);
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') cancel(); };
    const blur = () => { if (wanted.current) cancel(); };
    document.addEventListener('visibilitychange', hide); window.addEventListener('blur', blur);
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('blur', blur); };
  }, [cancel]);

  const finish = useCallback(() => {
    wanted.current = false;
    if (captureState.current === 'permission') { captureId.current++; state('idle'); return; }
    if (recorder.current?.state === 'recording') { recorder.current.stop(); stopTracks(); }
  }, [state, stopTracks]);

  const start = useCallback(async (autoEnd = false) => {
    if (!current.current.active || current.current.busy || captureState.current !== 'idle') return;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('Voice recording is unavailable in this browser. You can still type.'); return; }
    stopSpeaking(); wanted.current = true;
    const id = ++captureId.current;
    const actor = current.current.identity;
    state('permission');
    try {
      // Create/resume during the explicit Start conversation gesture on the first turn.
      // Later turns run only within that same user-started conversation.
      if (autoEnd) {
        if (typeof AudioContext === 'undefined') throw new Error('Automatic conversation needs Web Audio. Use a single voice message or type instead.');
        const context = new AudioContext(); detector.current = { context, source: null, timer: null };
        void context.resume().catch(() => {});
      }
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (!alive.current || id !== captureId.current || !wanted.current || !current.current.active || actor !== current.current.identity) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const recording = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      recorder.current = recording;
      const chunks: Blob[] = []; let bytes = 0;
      const started = performance.now();
      recording.ondataavailable = event => {
        if (id !== captureId.current || !event.data.size) return;
        bytes += event.data.size;
        if (bytes > maxBytes) { setError('That recording is too large. Please use a shorter message.'); cancel(); return; }
        chunks.push(event.data);
      };
      recording.onerror = () => { if (id === captureId.current) { setError('The microphone recording failed. Please try again or type.'); cancel(); } };
      recording.onstop = async () => {
        if (!alive.current || id !== captureId.current || !current.current.active || actor !== current.current.identity) return;
        stopTracks();
        if (wanted.current) { wanted.current = false; state('idle'); setError('The microphone stopped unexpectedly. That recording was discarded; please try again or type.'); return; }
        recorder.current = null;
        const duration = Math.min(60000, Math.round(performance.now() - started));
        if (duration < 250 || !bytes) { state('idle'); setError('Hold the button a little longer and speak clearly. Nothing was sent.'); return; }
        const audio = new Blob(chunks, { type: recording.mimeType || mime || 'audio/webm' });
        chunks.length = 0;
        state('transcribing');
        const controller = new AbortController(); transcription.current = controller;
        try {
          const text = await transcribeVoice(audio, duration, controller.signal);
          if (alive.current && id === captureId.current && current.current.active && actor === current.current.identity) { state('idle'); current.current.onTranscript(text); }
        } catch (failure) { if (alive.current && id === captureId.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'The recording could not be transcribed. You can still type.'); }
        finally { if (alive.current && id === captureId.current) { transcription.current = null; state('idle'); } }
      };
      recording.start(250); state('recording'); setSeconds(0);
      if (autoEnd && detector.current) {
        const { context } = detector.current;
        const source = context.createMediaStreamSource(media); const analyser = context.createAnalyser();
        analyser.fftSize = 1024; source.connect(analyser); detector.current.source = source;
        const waveform = new Float32Array(analyser.fftSize); const detect = createFarmVoiceActivity(started);
        detector.current.timer = setInterval(() => {
          if (id !== captureId.current) return;
          if (context.state !== 'running') { cancel(); setError('Audio detection paused. Start conversation again, or use a single voice message.'); return; }
          analyser.getFloatTimeDomainData(waveform);
          const rms = Math.sqrt(waveform.reduce((sum, sample) => sum + sample * sample, 0) / waveform.length);
          const activity = detect(rms, performance.now());
          if (activity === 'send') finish();
          else if (activity === 'silent') { cancel(); setError('No speech detected for 20 seconds. Conversation ended; start again when you’re ready.'); }
        }, 80);
      }
      timer.current = setTimeout(finish, 60000);
      ticker.current = setInterval(() => { if (alive.current) setSeconds(Math.min(60, Math.floor((performance.now() - started) / 1000))); }, 1000);
    } catch (failure) {
      if (!alive.current || id !== captureId.current) return;
      cancel();
      const name = failure && typeof failure === 'object' && 'name' in failure ? failure.name : '';
      setError(name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it for this local site, then try again; typing still works.' : name === 'NotFoundError' ? 'No microphone was found. Connect one or type your message.' : failure instanceof Error && failure.message.startsWith('Automatic conversation') ? failure.message : 'The microphone could not be opened. Check whether another app is using it, or type instead.');
    }
  }, [cancel, finish, state, stopSpeaking, stopTracks]);

  const playReply = useCallback(async (text: string) => {
    if (!current.current.active || current.current.busy || captureState.current !== 'idle') return;
    stopSpeaking(); setError('');
    let id = ++speechId.current;
    const actor = current.current.identity;
    try {
      if (clip.current?.text !== text) {
        stopSpeaking(true); const newId = ++speechId.current; id = newId;
        setSpeech('loading'); const controller = new AbortController(); synthesis.current = controller;
        const audio = await fetchSpokenReply(text, controller.signal);
        if (!alive.current || controller.signal.aborted || newId !== speechId.current || !current.current.active || actor !== current.current.identity) return;
        const url = URL.createObjectURL(audio);
        clip.current = { text, url, audio: new Audio(url) };
      } else if (id !== speechId.current) return;
      const playing = clip.current;
      if (!playing) return;
      const playbackId = speechId.current;
      playing.audio.onended = () => { if (alive.current && playbackId === speechId.current) setSpeech('ready'); };
      playing.audio.onerror = () => { if (alive.current && playbackId === speechId.current) { setSpeech('ready'); setError('Audio playback failed. You can still read the reply.'); } };
      try { await playing.audio.play(); if (alive.current && playbackId === speechId.current) setSpeech('playing'); }
      catch { if (alive.current && playbackId === speechId.current) { setSpeech('ready'); setError('Tap Play reply to enable audio in this browser.'); } }
    } catch (failure) { if (alive.current && id === speechId.current && !synthesis.current?.signal.aborted && current.current.active && actor === current.current.identity) { setSpeech('idle'); setError(failure instanceof Error ? failure.message : 'Spoken reply unavailable. You can still read it.'); } }
  }, [stopSpeaking]);
  return { capture, speech, error, seconds, start, finish, cancel, playReply, stopSpeaking };
}
