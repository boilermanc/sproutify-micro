-- Additive only: no enrollment/backfill from profile or pre_registrations.
BEGIN;
CREATE TABLE public.email_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND length(email) <= 254),
  first_name text NOT NULL CHECK (length(first_name) BETWEEN 1 AND 100),
  status text NOT NULL CHECK (status IN ('pending','subscribed','unsubscribed')),
  consent_version text NOT NULL,
  consent_text text NOT NULL,
  consent_source text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  confirmation_hash text UNIQUE CHECK (confirmation_hash ~ '^[a-f0-9]{64}$'),
  confirmation_expires_at timestamptz,
  unsubscribe_hash text NOT NULL UNIQUE CHECK (unsubscribe_hash ~ '^[a-f0-9]{64}$'),
  CHECK (status <> 'subscribed' OR confirmed_at IS NOT NULL)
);
CREATE TABLE public.email_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.email_subscriptions(id),
  event_type text NOT NULL CHECK (event_type IN ('requested','confirmed','unsubscribed')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  consent_version text NOT NULL,
  consent_text text NOT NULL,
  consent_source text NOT NULL
);
CREATE INDEX email_consent_request_rate ON public.email_consent_events(subscription_id, occurred_at) WHERE event_type = 'requested';
CREATE TABLE public.email_marketing_suppressions (
  email text PRIMARY KEY CHECK (email = lower(btrim(email))),
  reason text NOT NULL CHECK (reason IN ('hard_bounce','complaint','manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_marketing_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_subscriptions, public.email_consent_events, public.email_marketing_suppressions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.email_subscriptions TO service_role;
GRANT SELECT, INSERT ON public.email_consent_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.email_marketing_suppressions TO service_role;

-- Server-only RPC. Invoker rights deliberately require the backend service role.
CREATE FUNCTION public.email_subscription_action(p_action text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  s public.email_subscriptions%ROWTYPE;
  e text := lower(btrim(p_payload->>'email'));
  token_hash text := p_payload->>'token_hash';
  wording CONSTANT text := 'Email me the Sproutify Micro newsletter, product updates and early-access news. I can unsubscribe anytime.';
BEGIN
  IF p_action = 'request' THEN
    IF p_payload->'consent' IS DISTINCT FROM 'true'::jsonb OR p_payload->>'consent_version' IS DISTINCT FROM 'micro-email-v1'
      OR p_payload->>'source' NOT IN ('pre-launch','pre-launch-old') OR p_payload->>'source' IS NULL
      OR e IS NULL OR e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(e) > 254
      OR coalesce(length(btrim(p_payload->>'first_name')),0) NOT BETWEEN 1 AND 100
      OR coalesce(p_payload->>'confirmation_hash','') !~ '^[a-f0-9]{64}$'
      OR coalesce(p_payload->>'unsubscribe_hash','') !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'invalid consent request' USING ERRCODE = '22023';
    END IF;
    -- Serializes first insert, repeat requests and rate-limit decisions for this address.
    PERFORM pg_advisory_xact_lock(hashtextextended(e, 517));
    SELECT * INTO s FROM public.email_subscriptions WHERE email = e FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.email_marketing_suppressions WHERE email = e) OR s.status = 'subscribed' THEN
      RETURN jsonb_build_object('accepted',true,'send',false);
    END IF;
    IF s.id IS NOT NULL AND (s.requested_at > now()-interval '60 seconds' OR
      (SELECT count(*) FROM public.email_consent_events WHERE subscription_id=s.id AND event_type='requested' AND occurred_at > now()-interval '1 hour') >= 3) THEN
      RETURN jsonb_build_object('accepted',true,'send',false);
    END IF;
    INSERT INTO public.email_subscriptions(email,first_name,status,consent_version,consent_text,consent_source,confirmation_hash,confirmation_expires_at,unsubscribe_hash)
    VALUES(e,btrim(p_payload->>'first_name'),'pending','micro-email-v1',wording,p_payload->>'source',p_payload->>'confirmation_hash',now()+interval '48 hours',p_payload->>'unsubscribe_hash')
    ON CONFLICT(email) DO UPDATE SET first_name=excluded.first_name,status='pending',consent_version=excluded.consent_version,
      consent_text=excluded.consent_text,consent_source=excluded.consent_source,requested_at=now(),confirmed_at=NULL,
      confirmation_hash=excluded.confirmation_hash,confirmation_expires_at=excluded.confirmation_expires_at
    RETURNING * INTO s;
    INSERT INTO public.email_consent_events(subscription_id,event_type,consent_version,consent_text,consent_source)
      VALUES(s.id,'requested',s.consent_version,s.consent_text,s.consent_source);
    RETURN jsonb_build_object('accepted',true,'send',true,'request_id',(SELECT id FROM public.email_consent_events WHERE subscription_id=s.id ORDER BY occurred_at DESC,id DESC LIMIT 1));
  ELSIF p_action IN ('confirm','unsubscribe') THEN
    IF coalesce(token_hash,'') !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('success',false); END IF;
    IF p_action='confirm' THEN
      SELECT * INTO s FROM public.email_subscriptions WHERE confirmation_hash=token_hash FOR UPDATE;
      IF s.id IS NULL OR s.status <> 'pending' OR s.confirmation_expires_at <= now()
        OR EXISTS(SELECT 1 FROM public.email_marketing_suppressions WHERE email=s.email) THEN RETURN jsonb_build_object('success',false); END IF;
      UPDATE public.email_subscriptions SET status='subscribed',confirmed_at=now(),unsubscribed_at=NULL,confirmation_hash=NULL,confirmation_expires_at=NULL WHERE id=s.id;
    ELSE
      SELECT * INTO s FROM public.email_subscriptions WHERE unsubscribe_hash=token_hash FOR UPDATE;
      IF s.id IS NULL THEN RETURN jsonb_build_object('success',false); END IF;
      IF s.status='unsubscribed' THEN RETURN jsonb_build_object('success',true); END IF;
      UPDATE public.email_subscriptions SET status='unsubscribed',unsubscribed_at=now(),confirmation_hash=NULL,confirmation_expires_at=NULL WHERE id=s.id;
    END IF;
    INSERT INTO public.email_consent_events(subscription_id,event_type,consent_version,consent_text,consent_source)
      VALUES(s.id,CASE WHEN p_action='confirm' THEN 'confirmed' ELSE 'unsubscribed' END,s.consent_version,s.consent_text,s.consent_source);
    RETURN jsonb_build_object('success',true);
  END IF;
  RAISE EXCEPTION 'unknown consent action' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION public.email_subscription_action(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_subscription_action(text,jsonb) TO service_role;

CREATE FUNCTION public.email_marketing_eligible(p_emails text[])
RETURNS TABLE(email text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT s.email FROM public.email_subscriptions s
  WHERE s.status='subscribed' AND s.confirmed_at IS NOT NULL AND s.email=ANY(p_emails)
    AND NOT EXISTS(SELECT 1 FROM public.email_marketing_suppressions x WHERE x.email=s.email);
$$;
REVOKE ALL ON FUNCTION public.email_marketing_eligible(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_marketing_eligible(text[]) TO service_role;

-- Trellis reads this minimal audience through its server-side spoke connection.
-- No confirmation/unsubscribe secrets or unconfirmed/withdrawn contacts are exported.
CREATE VIEW public.micro_newsletter_audience WITH (security_invoker=true) AS
  SELECT s.id,s.email,s.first_name,true AS subscribed,s.confirmed_at AS created_at
  FROM public.email_subscriptions s
  WHERE s.status='subscribed' AND s.confirmed_at IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.email_marketing_suppressions x WHERE x.email=s.email);
REVOKE ALL ON public.micro_newsletter_audience FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.micro_newsletter_audience TO service_role;
COMMIT;
