export const voiceAudioTypes = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mpeg': 'mp3' };
export const maxVoiceBytes = 5 * 1024 * 1024;

export async function transcribeFarmAudio(bytes, mime, { apiKey, fetcher = fetch, signal }) {
  if (!Object.hasOwn(voiceAudioTypes, mime) || !bytes.length || bytes.length > maxVoiceBytes) throw new Error('Invalid voice clip.');
  const form = new FormData();
  form.append('model', 'gpt-4o-mini-transcribe');
  form.append('file', new Blob([bytes], { type: mime }), `farm-message.${voiceAudioTypes[mime]}`);
  form.append('response_format', 'json');
  const response = await fetcher('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal });
  if (!response.ok) throw new Error('Voice transcription is unavailable. Nothing has been sent to the farm conversation.');
  const result = await response.json();
  if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('No speech was recognized. Please try again.');
  if (result.text.length > 1000) throw new Error('That voice message is too long. Please use a shorter message.');
  return { text: result.text.trim(), writesEnabled: false };
}

export async function speakFarmReply(text, { apiKey, fetcher = fetch, signal, format = 'mp3' }) {
  if (typeof text !== 'string' || !text.trim() || text.length > 3200 || !['mp3', 'wav'].includes(format)) throw new Error('Invalid spoken reply.');
  const response = await fetcher('https://api.openai.com/v1/audio/speech', {
    method: 'POST', signal, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'coral', input: text, response_format: format,
      instructions: 'Speak naturally, clearly and calmly, like a practical farm assistant. Keep numbers and crop names clear. Do not add words or imply that work has been saved.' }),
  });
  if (!response.ok) throw new Error('The spoken reply is unavailable. You can still read the conversation.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 3 * 1024 * 1024) throw new Error('The spoken reply could not be verified.');
  return { bytes, type: format === 'wav' ? 'audio/wav' : 'audio/mpeg' };
}
