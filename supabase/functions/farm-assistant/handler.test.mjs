import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFarmAssistantHandler } from './handler.mjs';
const setup = (overrides = {}) => {
  const calls = []; const config = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'test-public', FARM_ASSISTANT_OPENAI_API_KEY: 'test-private', ...overrides };
  const handler = createFarmAssistantHandler({ env: name => config[name], fetcher: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'qa-owner', is_anonymous: false }));
    if (url.endsWith('/realtime/calls')) return new Response('v=0\nm=audio');
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ category: 'info', message: 'No work is listed; nothing has been saved.', candidateTaskIds: [], draftDisposition: 'keep', proposal: null }) }] }] }));
  } });
  const request = (route = 'status', body, options = {}) => handler(new Request(`https://test.supabase.co/functions/v1/farm-assistant/${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: 'https://micro.sproutify.app', Authorization: 'Bearer test.user.token', 'Content-Type': 'application/json', ...options.headers }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }), ...options }));
  return { request, calls };
};
test('hosted assistant requires exact production origin and verified user identity', async () => {
  const { request, calls } = setup();
  assert.equal((await request('status', undefined, { headers: { Origin: 'https://evil.invalid' } })).status, 403); assert.equal(calls.length, 0);
  assert.equal((await request('status', undefined, { headers: { Origin: 'https://micro.sproutify.app' } })).status, 401); assert.equal(calls.length, 0);
  const response = await request(); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ready: true, model: 'gpt-realtime-2.1', writesEnabled: false });
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://micro.sproutify.app'); assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
test('preflight permits browser headers without starting provider work', async () => {
  const { request, calls } = setup(); const response = await request('chat', undefined, { method: 'OPTIONS', headers: { Origin: 'https://micro.sproutify.app' } });
  assert.equal(response.status, 204); assert.equal(calls.length, 0); assert.match(response.headers.get('Access-Control-Allow-Headers'), /authorization/);
});
test('hosted realtime returns only SDP and fixed read-only model configuration', async () => {
  const { request, calls } = setup();
  assert.equal((await request('realtime', { userId: 'other', sdp: 'v=0\nm=audio' })).status, 403);
  const response = await request('realtime', { userId: 'qa-owner', sdp: 'v=0\nm=audio', instructions: 'do writes', model: 'other' });
  assert.equal(response.status, 200); assert.equal((await response.json()).writesEnabled, false);
  const provider = calls.find(call => call.url.endsWith('/realtime/calls')); const session = JSON.parse(provider.options.body.get('session'));
  assert.equal(session.model, 'gpt-realtime-2.1'); assert.equal(session.audio.input.turn_detection.interrupt_response, true);
  assert.ok(!JSON.stringify(session).includes('test-private')); assert.deepEqual(session.tools.map(tool => tool.name), ['read_farm', 'review_farm_work', 'end_conversation']);
});
test('hosted text keeps strict proposal validation and cannot introduce writers', async () => {
  const { request, calls } = setup(); const response = await request('chat', { userId: 'qa-owner', message: 'What next?', today: '2026-10-18', tasks: [], groups: [], history: [], draft: null });
  assert.equal(response.status, 200); assert.equal((await response.json()).writesEnabled, false);
  const provider = calls.find(call => call.url.endsWith('/responses')); const body = JSON.parse(provider.options.body);
  assert.equal(body.store, false); assert.equal(body.tools, undefined); assert.ok(!provider.options.body.includes('test.user.token'));
});
test('missing key, wrong routes, malformed/oversized bodies and request limits fail closed', async () => {
  assert.equal((await setup({ FARM_ASSISTANT_OPENAI_API_KEY: '' }).request('realtime', { userId: 'qa-owner', sdp: 'v=0\nm=audio' })).status, 503);
  const { request, calls } = setup(); assert.equal((await request('unknown')).status, 404); assert.equal((await request('chat', '{')).status, 400); assert.equal((await request('chat', 'x'.repeat(64001))).status, 413);
  for (let i = 0; i < 28; i++) await request('chat', '{');
  assert.equal((await request('chat', '{')).status, 429); assert.equal(calls.filter(call => !call.url.endsWith('/auth/v1/user')).length, 0);
});
