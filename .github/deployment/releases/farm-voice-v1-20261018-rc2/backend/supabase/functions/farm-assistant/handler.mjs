import { askFarmAI } from '../_shared/farm-assistant-core.mjs';
import { connectFarmRealtime, realtimeModel } from '../_shared/farm-realtime-core.mjs';

export function createFarmAssistantHandler({ env, fetcher = fetch, now = Date.now }) {
  const activity = new Map();
  return async request => {
    const origin = request.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
    const respond = (status, value) => new Response(JSON.stringify(value), { status, headers });
    if (origin !== 'https://micro.sproutify.app') return respond(403, { error: 'This farm app origin is not allowed.', writesEnabled: false });
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const pieces = new URL(request.url).pathname.split('/').filter(Boolean); const index = pieces.indexOf('farm-assistant');
    const route = index >= 0 && pieces.length === index + 2 ? pieces[index + 1] : '';
    if (!['status', 'chat', 'realtime'].includes(route)) return respond(404, { error: 'Unknown farm assistant route.', writesEnabled: false });
    if (request.method !== (route === 'status' ? 'GET' : 'POST')) return respond(405, { error: 'Method not allowed.', writesEnabled: false });
    const authorization = request.headers.get('Authorization') || '';
    if (!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) return respond(401, { error: 'Sign in to your farm before using AI.', writesEnabled: false });
    const authUrl = env('SUPABASE_URL'); const anonKey = env('SUPABASE_ANON_KEY'); const apiKey = env('FARM_ASSISTANT_OPENAI_API_KEY');
    if (!authUrl || !anonKey) return respond(503, { error: 'Farm assistant authentication is unavailable.', writesEnabled: false });
    let userId;
    try {
      const response = await fetcher(`${authUrl}/auth/v1/user`, { headers: { Authorization: authorization, apikey: anonKey }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) return respond(401, { error: 'Your farm login could not be verified.', writesEnabled: false });
      const user = await response.json();
      if (typeof user.id !== 'string' || !user.id || user.is_anonymous === true) return respond(401, { error: 'Use your farm account to access AI.', writesEnabled: false });
      userId = user.id;
    } catch { return respond(401, { error: 'Your farm login could not be verified.', writesEnabled: false }); }
    if (route === 'status') return respond(200, { ready: Boolean(apiKey), model: realtimeModel, writesEnabled: false });
    if (!apiKey) return respond(503, { error: 'Farm AI setup is incomplete. No work has been saved.', writesEnabled: false });
    if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') return respond(400, { error: 'Use a JSON request.', writesEnabled: false });
    const time = now(); const identity = `${userId}:${route}`;
    if (activity.size >= 2000) {
      for (const [key, item] of activity) if (!item.busy && time - item.start > 600000) activity.delete(key);
      if (activity.size >= 2000) return respond(429, { error: 'Farm AI is busy. Try again shortly.', writesEnabled: false });
    }
    const entry = activity.get(identity) || { start: time, count: 0, busy: false };
    if (entry.busy) return respond(429, { error: 'Wait for the current request to finish.', writesEnabled: false });
    if (time - entry.start > 600000) { entry.start = time; entry.count = 0; }
    if (entry.count >= 30) return respond(429, { error: 'Farm AI limit reached. Try again later.', writesEnabled: false });
    entry.count++; entry.busy = true; activity.set(identity, entry);
    try {
      const reader = request.body?.getReader(); let size = 0; const chunks = [];
      if (!reader) return respond(400, { error: 'Missing request body.', writesEnabled: false });
      try {
        for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 64000) { await reader.cancel(); return respond(413, { error: 'Request is too large.', writesEnabled: false }); } chunks.push(value); }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let body; try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return respond(400, { error: 'Invalid JSON.', writesEnabled: false }); }
      if (body?.userId !== userId) return respond(403, { error: 'Your farm identity changed. Reopen chat.', writesEnabled: false });
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(route === 'realtime' ? 30000 : 45000)]);
      return respond(200, route === 'realtime' ? await connectFarmRealtime(body.sdp, { apiKey, userId, fetcher, signal }) : await askFarmAI(body, { apiKey, fetcher, signal }));
    } catch (failure) {
      const safe = ['Realtime voice is temporarily limited. Try again shortly.', 'The realtime voice connection could not be started. You can still type.', 'AI usage is temporarily limited. Try again shortly.', 'The AI provider could not answer. No work was saved.', 'The AI response was incomplete. No work was saved.', 'The assistant could not help with that request. No work was saved.'];
      return respond(502, { error: safe.includes(failure.message) ? failure.message : 'The farm AI response could not be verified. No work has been saved.', writesEnabled: false });
    } finally { entry.busy = false; }
  };
}
