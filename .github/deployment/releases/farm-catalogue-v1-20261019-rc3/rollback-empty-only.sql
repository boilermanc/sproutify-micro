-- Local preparation only. Pause new capture before reverting application code.
-- Do not erase consent history or suppression data to roll back a release.
-- Schema removal is permitted ONLY before any consent/suppression record exists.
BEGIN;
LOCK TABLE public.email_subscriptions, public.email_consent_events, public.email_marketing_suppressions IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.email_subscriptions) OR EXISTS(SELECT 1 FROM public.email_consent_events)
    OR EXISTS(SELECT 1 FROM public.email_marketing_suppressions) THEN
   RAISE EXCEPTION 'Consent data exists: preserve tables, pause new requests and roll forward; keep unsubscribe working';
 END IF;
END $$;
DROP VIEW public.micro_newsletter_audience;
DROP FUNCTION public.email_subscription_action(text,jsonb);
DROP FUNCTION public.email_marketing_eligible(text[]);
DROP TABLE public.email_consent_events;
DROP TABLE public.email_marketing_suppressions;
DROP TABLE public.email_subscriptions;
COMMIT;
