export const CONSENT_VERSION = 'micro-email-v1';
export const CONSENT_TEXT = 'Email me the Sproutify Micro newsletter, product updates and early-access news. I can unsubscribe anytime.';
export const hashToken = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join('');
export const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join('');
export async function unsubscribeToken(email, secret) {
  if (!secret || secret.length < 32) throw Error('Email link signing unavailable');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`unsubscribe:v1:${email.toLowerCase().trim()}`))), x => x.toString(16).padStart(2, '0')).join('');
}
export function confirmationEmail(email, token, removalToken, siteUrl) {
  const confirm = `${siteUrl}/email/confirm#token=${token}`;
  const unsubscribe = `${siteUrl}/email/unsubscribe#token=${removalToken}`;
  return { to: email, subject: 'Confirm your Sproutify Micro email subscription',
    text: `Confirm your email\n\nYou asked to receive the Sproutify Micro newsletter, product updates and early-access news.\n\nConfirm: ${confirm}\n\nThis link expires in 48 hours. You are not subscribed until you confirm. If you did not ask for this, ignore this email or cancel the request: ${unsubscribe}`,
    html: `<!doctype html><html lang="en"><head><title>Confirm your email</title></head><body><h1>Confirm your email</h1><p>You asked to receive the Sproutify Micro newsletter, product updates and early-access news.</p><p><a href="${confirm}">Confirm my subscription</a></p><p>This link expires in 48 hours. You are not subscribed until you confirm.</p><p>If you did not ask for this, ignore this email or <a href="${unsubscribe}">cancel the request</a>.</p></body></html>` };
}
async function boundedText(req) {
  const reader = req.body?.getReader();
  if (!reader) throw Error('Missing body');
  const chunks = []; let size = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 4096) { await reader.cancel(); throw Error('Body too large'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
async function boundedJson(req) {
  const body = JSON.parse(await boundedText(req));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('Invalid body');
  return body;
}
// Dependencies are injected so local tests never contact a provider or production database.
export function consentHandler(svc, { siteUrl = 'https://micro.sproutify.app', origins = ['https://micro.sproutify.app'], requestsEnabled = true } = {}) {
  if (!/^https:\/\/micro\.sproutify\.app$|^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(siteUrl)) throw Error('Invalid email site URL');
  return async req => {
    const origin = req.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', Vary: 'Origin', ...(origin && origins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } : {}) };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !origins.includes(origin)) return reply(403, { error: 'Origin not allowed' });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return reply(405, { error: 'Use POST' });
    let body;
    try {
      if (req.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) {
        // RFC 8058: mail clients POST without a browser session. GET never mutates.
        if (await boundedText(req) !== 'List-Unsubscribe=One-Click') throw Error('Invalid one-click body');
        body = { action: 'unsubscribe', token: new URL(req.url).searchParams.get('token') };
      } else { body = await boundedJson(req); }
    } catch { return reply(400, { error: 'Invalid request' }); }
    try {
      if (body.action === 'request') {
        if (!requestsEnabled) return reply(503, { error: 'Email registration is temporarily paused.' });
        if (body.consent !== true || body.consent_version !== CONSENT_VERSION || !['pre-launch', 'pre-launch-old'].includes(body.source) ||
          typeof body.first_name !== 'string' || !body.first_name.trim() || body.first_name.trim().length > 100 ||
          typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
          typeof body.turnstile_token !== 'string' || !body.turnstile_token.trim() || body.turnstile_token.length > 2048) return reply(400, { error: 'Please provide your details and email permission.' });
        if (!await svc.captcha(body.turnstile_token)) return reply(403, { error: 'Verification failed. Please complete a new verification.' });
        const email = body.email.trim().toLowerCase();
        const token = newToken(); const removal = await svc.unsubscribeToken(email);
        const result = await svc.action('request', { email, first_name: body.first_name.trim(), consent: true, consent_version: CONSENT_VERSION, source: body.source, confirmation_hash: await hashToken(token), unsubscribe_hash: await hashToken(removal) });
        if (result?.accepted !== true || typeof result.send !== 'boolean') throw Error('Request not confirmed');
        if (result.send) {
          if (!/^[a-f0-9-]{36}$/.test(result.request_id)) throw Error('Missing request ID');
          await svc.send(confirmationEmail(email, token, removal, siteUrl), `email-confirm/${result.request_id}`);
        }
        // Same response for pending, existing, suppressed and rate-limited addresses.
        return reply(202, { success: true, status: 'check_email', requestAccepted: true });
      }
      if (['confirm', 'unsubscribe'].includes(body.action) && typeof body.token === 'string' && /^[a-f0-9]{64}$/.test(body.token)) {
        const result = await svc.action(body.action, { token_hash: await hashToken(body.token) });
        if (result?.success !== true) return reply(400, { error: 'This link is invalid, expired or already used. Please use the latest email or sign up again.' });
        return reply(200, { success: true, status: body.action === 'confirm' ? 'subscribed' : 'unsubscribed' });
      }
      return reply(400, { error: 'Invalid request' });
    } catch { return reply(503, { error: 'We could not confirm this request. Please wait a minute and try again.' }); }
  };
}

const escapeHtml = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export async function marketingMessages(emails, { eligible, secret, postalAddress, endpoint, siteUrl = 'https://micro.sproutify.app' }) {
  if (!postalAddress?.trim() || postalAddress.length > 500 || !/^https:\/\/.+\/email-subscriptions$/.test(endpoint ?? '')) throw Error('Marketing identity or unsubscribe configuration unavailable');
  const addresses = emails.map(message => message.to.toLowerCase().trim());
  const permitted = await eligible(addresses);
  if (!Array.isArray(permitted) || addresses.some(email => !permitted.some(row => row.email === email))) throw Error('Marketing consent missing or suppressed; campaign must be reviewed');
  return Promise.all(emails.map(async message => {
    const token = await unsubscribeToken(message.to, secret);
    const link = `${siteUrl}/email/unsubscribe#token=${token}`;
    const footer = `<footer><p>Sproutify Micro newsletter and product updates<br>${escapeHtml(postalAddress)}</p><p><a href="${link}">Unsubscribe</a></p></footer>`;
    const html = /<\/body>/i.test(message.html) ? message.html.replace(/<\/body>/i, `${footer}</body>`) : message.html + footer;
    return { ...message, html, headers: { 'List-Unsubscribe': `<${endpoint}?token=${token}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
  }));
}
