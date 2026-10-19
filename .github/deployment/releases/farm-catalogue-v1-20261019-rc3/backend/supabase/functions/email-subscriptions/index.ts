import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';
import { consentHandler, unsubscribeToken } from '../_shared/email-consent-core.mjs';

// Public capability-token endpoint; no farm/account data is exposed. CAPTCHA gates requests.
const env = (name: string) => Deno.env.get(name) ?? '';
const url = env('SUPABASE_URL'); const service = env('SUPABASE_SERVICE_ROLE_KEY');
const mail = env('RESEND_API_KEY'); const captchaSecret = env('MICRO_TURNSTILE_SECRET');
const linkSecret = env('EMAIL_SUBSCRIPTION_LINK_SECRET');
const client = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const handler = consentHandler({
  unsubscribeToken: (email: string) => unsubscribeToken(email, linkSecret),
  async action(action: string, payload: Record<string, unknown>) {
    const { data, error } = await client.rpc('email_subscription_action', { p_action: action, p_payload: payload });
    if (error) throw Error('Subscription storage unavailable');
    return data;
  },
  async captcha(token: string) {
    if (!captchaSecret || !mail || linkSecret.length < 32) throw Error('Registration unavailable');
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: captchaSecret, response: token }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true && result.hostname === 'micro.sproutify.app' && result.action === 'micro_waitlist';
  },
  async send(message: Record<string, unknown>, idempotency: string) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${mail}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotency },
      body: JSON.stringify({ ...message, from: 'Team Sproutify <team@sproutify.app>' }),
    });
    if (!response.ok) throw Error('Confirmation send not confirmed');
    const result = await response.json();
    if (typeof result.id !== 'string' || !result.id.trim()) throw Error('Confirmation send not confirmed');
  },
}, { requestsEnabled: env('EMAIL_SUBSCRIPTION_REQUESTS_ENABLED') === 'true' });
Deno.serve(req => {
  // Confirmation/unsubscribe must keep working even while new requests are paused.
  if (!url || !service) return new Response(JSON.stringify({ error: 'Email subscriptions unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  return handler(req);
});
