import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectFarmRealtime, farmRealtimeConfig } from './farm-realtime.mjs';
test('native speech session uses server interruption with only read/review/end tools', () => {
  assert.equal(farmRealtimeConfig.model, 'gpt-realtime-2.1'); assert.deepEqual(farmRealtimeConfig.output_modalities, ['audio']);
  assert.equal(farmRealtimeConfig.audio.input.turn_detection.interrupt_response, true); assert.equal(farmRealtimeConfig.audio.input.turn_detection.create_response, true);
  assert.deepEqual(farmRealtimeConfig.tools.map(tool => tool.name), ['read_farm', 'review_farm_work', 'end_conversation']); assert.match(farmRealtimeConfig.instructions, /NO write tools/);
});
test('unified SDP negotiation sends only fixed server config and never returns the private key', async () => {
  let request;
  const result = await connectFarmRealtime('v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n', { apiKey: 'test-not-real', userId: 'qa-user', fetcher: async (url, options) => {
    request = { url, ...options }; return { ok: true, text: async () => 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' };
  } });
  assert.equal(request.url, 'https://api.openai.com/v1/realtime/calls'); assert.deepEqual(JSON.parse(request.body.get('session')), farmRealtimeConfig);
  assert.match(request.headers['OpenAI-Safety-Identifier'], /^[a-f0-9]{64}$/); assert.equal(result.writesEnabled, false); assert.ok(!JSON.stringify(result).includes('test-not-real'));
});
test('invalid offers and provider answers fail closed, and provider bodies are never echoed', async () => {
  let called = false; await assert.rejects(connectFarmRealtime('not-sdp', { apiKey: 'test', userId: 'qa', fetcher: async () => { called = true; } })); assert.equal(called, false);
  await assert.rejects(connectFarmRealtime('v=0\nm=audio', { apiKey: 'test', userId: 'qa', fetcher: async () => ({ ok: false, status: 401, text: async () => 'secret provider body' }) }), /could not be started/);
  await assert.rejects(connectFarmRealtime('v=0\nm=audio', { apiKey: 'test', userId: 'qa', fetcher: async () => ({ ok: true, text: async () => 'unexpected' }) }), /Invalid realtime/);
});
