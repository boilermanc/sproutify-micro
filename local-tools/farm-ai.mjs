// Development-only, same-origin middleware. No database/automation/write tools.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { transcribeFarmAudio, speakFarmReply, voiceAudioTypes, maxVoiceBytes } from './farm-voice.mjs';
import { connectFarmRealtime } from './farm-realtime.mjs';

import { askFarmAI } from '../supabase/functions/_shared/farm-assistant-core.mjs';
export * from '../supabase/functions/_shared/farm-assistant-core.mjs';

function environment(file) { try { return parseEnv(readFileSync(file, 'utf8')); } catch { return {}; } }
export function farmAiPlugin({ envFile, frontendEnvFile, fetcher = fetch }) {
  return {
    name: 'local-read-only-farm-ai', apply: 'serve',
    configureServer(server) {
      const activity = new Map();
      server.middlewares.use(async (req, res, next) => {
        const route = (req.url || '').split('?')[0].replace(/^\/admin\//, '/');
        if (!['/__farm_ai/chat', '/__farm_ai/status', '/__farm_ai/transcribe', '/__farm_ai/speech', '/__farm_ai/realtime'].includes(route)) return next();
        const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
        const host = req.headers.host || '';
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)
          || req.headers.origin && req.headers.origin !== `http://${host}`) return send(403, { error: 'Local same-origin requests only.' });
        const config = environment(envFile);
        const front = environment(frontendEnvFile);
        const apiKey = config.OPENAI_API_KEY;
        const authUrl = front.VITE_SUPABASE_URL;
        const anonKey = front.VITE_SUPABASE_ANON_KEY;
        if (route === '/__farm_ai/status' && req.method === 'GET') return send(200, { ready: Boolean(apiKey && authUrl && anonKey), writesEnabled: false });
        const audioUpload = route === '/__farm_ai/transcribe';
        const mime = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (req.method !== 'POST' || req.headers.origin !== `http://${host}` || (audioUpload ? !Object.hasOwn(voiceAudioTypes, mime) : mime !== 'application/json')) return send(400, { error: audioUpload ? 'Use a supported recorded audio format.' : 'Use a same-origin JSON request.' });
        if (!apiKey || !authUrl || !anonKey) return send(503, { error: 'Local AI setup is incomplete. No work has been saved.' });
        if (!/^Bearer [A-Za-z0-9_.-]+$/.test(req.headers.authorization || '')) return send(401, { error: 'Sign in to your farm before using AI.' });
        let userId;
        try {
          const auth = await fetcher(`${authUrl}/auth/v1/user`, { headers: { Authorization: req.headers.authorization, apikey: anonKey }, signal: AbortSignal.timeout(10000) });
          if (!auth.ok) return send(401, { error: 'Your farm login could not be verified.' });
          userId = (await auth.json()).id;
          if (typeof userId !== 'string' || !userId) return send(401, { error: 'Your farm login could not be verified.' });
        } catch { return send(401, { error: 'Your farm login could not be verified.' }); }
        const now = Date.now();
        const activityKey = `${userId}:${route}`;
        const activityEntry = activity.get(activityKey) || { start: now, count: 0, busy: false };
        if (activityEntry.busy) return send(429, { error: 'Wait for the current answer before sending another question.' });
        if (now - activityEntry.start > 600000) { activityEntry.start = now; activityEntry.count = 0; }
        if (activityEntry.count >= 30) return send(429, { error: 'Local test conversation limit reached. Try again later.' });
        activityEntry.count++; activityEntry.busy = true; activity.set(activityKey, activityEntry);
        if (activity.size > 100) for (const [id, entry] of activity) if (!entry.busy && now - entry.start > 600000) activity.delete(id);
        try {
          let bytes = 0; const chunks = [];
          for await (const chunk of req) { bytes += chunk.length; if (bytes > (audioUpload ? maxVoiceBytes : 64000)) throw new Error('Request is too large.'); chunks.push(chunk); }
          const payload = Buffer.concat(chunks);
          if (audioUpload) {
            if (req.headers['x-farm-user'] !== userId) return send(403, { error: 'Your farm identity changed. Reopen chat before continuing.' });
            const duration = Number(req.headers['x-audio-duration-ms']);
            if (!Number.isSafeInteger(duration) || duration < 250 || duration > 60000) return send(400, { error: 'Keep a voice message between a moment and 60 seconds.' });
            const transcript = await transcribeFarmAudio(payload, mime, { apiKey, fetcher, signal: AbortSignal.timeout(45000) });
            return send(200, transcript);
          }
          const body = JSON.parse(payload.toString('utf8'));
          if (body.userId !== userId) return send(403, { error: 'Your farm identity changed. Reopen chat before continuing.' });
          if (route === '/__farm_ai/realtime') return send(200, await connectFarmRealtime(body.sdp, { apiKey, userId, fetcher, signal: AbortSignal.timeout(30000) }));
          if (route === '/__farm_ai/speech') {
            const audio = await speakFarmReply(body.text, { apiKey, fetcher, signal: AbortSignal.timeout(30000) });
            res.writeHead(200, { 'Content-Type': audio.type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(audio.bytes); return;
          }
          const result = await askFarmAI(body, { apiKey, fetcher, signal: AbortSignal.timeout(45000) });
          send(200, result);
        } catch (error) {
          // Never return provider bodies, request snapshots, headers or keys.
          const known = ['AI usage is temporarily limited. Try again shortly.', 'The local AI key could not be verified.', 'The AI provider could not answer. No work was saved.', 'The AI response was incomplete. No work was saved.', 'The assistant could not help with that request. No work was saved.'];
          const voiceErrors = ['Voice transcription is unavailable. Nothing has been sent to the farm conversation.', 'No speech was recognized. Please try again.', 'That voice message is too long. Please use a shorter message.', 'The spoken reply is unavailable. You can still read the conversation.'];
          const realtimeErrors = ['Realtime voice is temporarily limited. Try again shortly.', 'The realtime voice connection could not be started. You can still type.'];
          send(502, { error: [...known, ...voiceErrors, ...realtimeErrors].includes(error.message) ? error.message : route === '/__farm_ai/realtime' ? 'The realtime voice connection could not be verified. You can still type.' : audioUpload ? 'The recording could not be transcribed. Nothing has been sent to the farm conversation.' : route === '/__farm_ai/speech' ? 'The spoken reply is unavailable. You can still read the conversation.' : 'The AI reply could not be safely verified. No work has been saved. Try again.' });
        } finally { activityEntry.busy = false; }
      });
    },
  };
}
