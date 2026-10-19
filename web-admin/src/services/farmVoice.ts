import { getSupabaseClient } from '@/lib/supabaseClient';

async function voiceIdentity() {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || !data.session?.access_token || !data.session.user?.id) throw new Error('Sign in to your farm before using voice.');
  return { token: data.session.access_token, userId: data.session.user.id };
}
async function voiceError(response: Response, fallback: string): Promise<never> {
  let message = fallback;
  try { const data = await response.json(); if (typeof data.error === 'string') message = data.error; } catch { /* Keep a readable error. */ }
  throw new Error(message);
}
export async function transcribeVoice(audio: Blob, durationMs: number, signal: AbortSignal): Promise<string> {
  const identity = await voiceIdentity();
  const response = await fetch(`${import.meta.env.BASE_URL}__farm_ai/transcribe`, {
    method: 'POST', signal, body: audio, headers: { Authorization: `Bearer ${identity.token}`, 'Content-Type': audio.type, 'x-farm-user': identity.userId, 'x-audio-duration-ms': String(durationMs) },
  });
  if (!response.ok) return voiceError(response, 'Voice transcription is unavailable. Please try again or type.');
  const result = await response.json();
  if (result.writesEnabled !== false || typeof result.text !== 'string' || !result.text.trim() || result.text.length > 1000) throw new Error('The transcript could not be verified. Nothing was sent.');
  return result.text.trim();
}
export async function fetchSpokenReply(text: string, signal: AbortSignal): Promise<Blob> {
  const identity = await voiceIdentity();
  const response = await fetch(`${import.meta.env.BASE_URL}__farm_ai/speech`, {
    method: 'POST', signal, headers: { Authorization: `Bearer ${identity.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, userId: identity.userId }),
  });
  if (!response.ok) return voiceError(response, 'Spoken reply unavailable. You can still read it.');
  const audio = await response.blob();
  if (!audio.type.startsWith('audio/') || !audio.size || audio.size > 3 * 1024 * 1024) throw new Error('The spoken reply could not be verified.');
  return audio;
}
