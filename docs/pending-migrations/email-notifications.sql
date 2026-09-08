-- ===========================================================================
-- PENDING MIGRATION — NOT APPLIED
-- ===========================================================================
-- Production email event system.
--
-- Design:
--   * public.email_events is an append-only OUTBOX. Rows are written by
--     database triggers on authoritative tables, so an event survives the
--     browser closing mid-action. Every row carries a STABLE event_key with a
--     unique index, so a retried statement or a concurrent trigger can never
--     queue the same real-world event twice.
--   * public.email_deliveries records one row per (event, recipient). The
--     unique constraint is the delivery-level idempotence guard: a worker that
--     crashes after sending cannot send the same recipient twice.
--   * Trigger payloads hold record IDs and minimal routing data only. The
--     worker re-reads the authoritative rows and profiles itself, so a payload
--     can never smuggle in a recipient address or body text.
--   * Every operational RPC is SECURITY DEFINER and service_role-only.
--     Supabase's default privileges hand anon/authenticated EXECUTE on new
--     functions, so PUBLIC, anon and authenticated are revoked EXPLICITLY.
--
-- Idempotent: safe to run repeatedly.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Outbox tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL CHECK (event_type IN (
                    'id_verification_submitted',
                    'trip_posted',
                    'trip_assigned',
                    'subscription_activated',
                    'support_message',
                    'ride_message',
                    'test_alert'
                  )),
  event_key       text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts        integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at      timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_events_event_key_uidx
  ON public.email_events (event_key);

CREATE INDEX IF NOT EXISTS email_events_ready_idx
  ON public.email_events (next_attempt_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            uuid NOT NULL REFERENCES public.email_events (id) ON DELETE CASCADE,
  recipient_email     text NOT NULL CHECK (recipient_email = lower(btrim(recipient_email))),
  recipient_kind      text NOT NULL CHECK (recipient_kind IN ('admin', 'rider', 'driver', 'subscriber')),
  recipient_user_id   uuid,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'sent', 'skipped', 'failed')),
  claimed_at          timestamptz,
  attempts            integer NOT NULL DEFAULT 0,
  last_error          text,
  provider_message_id text,
  sent_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, recipient_email)
);

-- Upgrade path for an outbox created before delivery reservation existed.
ALTER TABLE public.email_deliveries
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE public.email_deliveries
  DROP CONSTRAINT IF EXISTS email_deliveries_status_check;
ALTER TABLE public.email_deliveries
  ADD CONSTRAINT email_deliveries_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'skipped', 'failed'));

-- Locked down: no client role may read or write the outbox at all.
ALTER TABLE public.email_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.email_events     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.email_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL  ON public.email_events     TO service_role;
GRANT ALL  ON public.email_deliveries TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Queueing
-- ---------------------------------------------------------------------------
-- Internal writer used by the triggers. SECURITY DEFINER so triggers fired by
-- ordinary users can insert into the locked-down outbox, but never callable by
-- a client (see the REVOKE block below).
CREATE OR REPLACE FUNCTION public.queue_email_event(
  p_event_type text,
  p_event_key  text,
  p_payload    jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_event_key IS NULL OR btrim(p_event_key) = '' THEN
    RAISE EXCEPTION 'event_key is required';
  END IF;

  INSERT INTO public.email_events (event_type, event_key, payload)
  VALUES (p_event_type, btrim(p_event_key), coalesce(p_payload, '{}'::jsonb))
  ON CONFLICT (event_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.email_events WHERE event_key = btrim(p_event_key);
  END IF;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Triggers on authoritative tables
-- ---------------------------------------------------------------------------

-- (1) ID submitted / resubmitted for verification.
-- Onboarding writes BOTH the profile (id_image_url / verification_submitted_at)
-- and a kyc_submissions row for the same upload. Both triggers therefore build
-- the SAME stable key from the user's profile verification_submitted_at, so one
-- upload queues exactly one event.
CREATE OR REPLACE FUNCTION public.email_id_submission_key(p_user_id uuid, p_fallback timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'idv_profile:' || p_user_id::text || ':' || coalesce(
    (SELECT p.verification_submitted_at FROM public.profiles p WHERE p.id = p_user_id),
    p_fallback,
    now()
  )::text;
$$;

CREATE OR REPLACE FUNCTION public.tg_email_event_kyc_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'pending'
     AND OLD.submitted_at IS NOT DISTINCT FROM NEW.submitted_at THEN
    RETURN NEW;
  END IF;

  PERFORM public.queue_email_event(
    'id_verification_submitted',
    public.email_id_submission_key(NEW.user_id, NEW.submitted_at),
    jsonb_build_object('submission_id', NEW.id, 'user_id', NEW.user_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_event_kyc_submitted ON public.kyc_submissions;
CREATE TRIGGER email_event_kyc_submitted
  AFTER INSERT OR UPDATE ON public.kyc_submissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_event_kyc_submitted();

-- (1b) ID submitted / resubmitted directly on the profile (id_image_url set or
--      replaced, or verification re-submitted). The image URL itself is NEVER
--      put in the payload — only the user id.
CREATE OR REPLACE FUNCTION public.tg_email_event_profile_id_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stamp timestamptz;
BEGIN
  IF NEW.id_image_url IS NULL OR btrim(NEW.id_image_url) = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.id_image_url IS NOT DISTINCT FROM NEW.id_image_url
     AND OLD.verification_submitted_at IS NOT DISTINCT FROM NEW.verification_submitted_at THEN
    RETURN NEW;
  END IF;

  v_stamp := NEW.verification_submitted_at;

  PERFORM public.queue_email_event(
    'id_verification_submitted',
    public.email_id_submission_key(NEW.id, v_stamp),
    jsonb_build_object('user_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_event_profile_id_submitted ON public.profiles;
CREATE TRIGGER email_event_profile_id_submitted
  AFTER INSERT OR UPDATE OF id_image_url, verification_submitted_at ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_event_profile_id_submitted();

-- (2) Trip posted, and (3) trip open -> assigned.
CREATE OR REPLACE FUNCTION public.tg_email_event_ride_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NOT DISTINCT FROM 'open' THEN
      PERFORM public.queue_email_event(
        'trip_posted',
        'trip_posted:' || NEW.id::text,
        jsonb_build_object('ride_id', NEW.id, 'rider_id', NEW.rider_id)
      );
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     AND OLD.status::text = 'open'
     AND NEW.status::text = 'assigned' THEN
    PERFORM public.queue_email_event(
      'trip_assigned',
      'trip_assigned:' || NEW.id::text || ':' || coalesce(NEW.assigned_driver_id::text, 'none'),
      jsonb_build_object(
        'ride_id', NEW.id,
        'rider_id', NEW.rider_id,
        'driver_id', NEW.assigned_driver_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_event_ride_request ON public.ride_requests;
CREATE TRIGGER email_event_ride_request
  AFTER INSERT OR UPDATE ON public.ride_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_event_ride_request();

-- (4) A Stripe-backed subscription first becomes active or trialing.
--     The trusted admin grant (no stripe_subscription_id) is deliberately NOT
--     an alert: it is not a new paying subscriber.
CREATE OR REPLACE FUNCTION public.tg_email_event_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now_live boolean;
  v_was_live boolean;
BEGIN
  v_now_live := NEW.subscription_active IS TRUE
                AND lower(coalesce(NEW.subscription_status, '')) IN ('active', 'trialing')
                AND NEW.stripe_subscription_id IS NOT NULL;
  v_was_live := OLD.subscription_active IS TRUE
                AND lower(coalesce(OLD.subscription_status, '')) IN ('active', 'trialing')
                AND OLD.stripe_subscription_id IS NOT NULL;

  IF v_now_live AND NOT v_was_live THEN
    PERFORM public.queue_email_event(
      'subscription_activated',
      'subscription_activated:' || NEW.stripe_subscription_id,
      jsonb_build_object('user_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_event_subscription ON public.profiles;
CREATE TRIGGER email_event_subscription
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_event_subscription();

-- (5) Support message submitted.
CREATE OR REPLACE FUNCTION public.tg_email_event_support_ticket()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.queue_email_event(
    'support_message',
    'support:' || NEW.id::text,
    jsonb_build_object('ticket_id', NEW.id, 'user_id', NEW.user_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_event_support_ticket ON public.support_tickets;
CREATE TRIGGER email_event_support_ticket
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_event_support_ticket();

-- (6) Trip chat message (subscriber notification only, never an admin alert).
CREATE OR REPLACE FUNCTION public.tg_email_event_ride_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.queue_email_event(
    'ride_message',
    'ride_message:' || NEW.id::text,
    jsonb_build_object(
      'message_id', NEW.id,
      'ride_id', NEW.ride_request_id,
      'sender_id', NEW.sender_id
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_event_ride_message ON public.ride_messages;
CREATE TRIGGER email_event_ride_message
  AFTER INSERT ON public.ride_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_event_ride_message();

-- ---------------------------------------------------------------------------
-- 4. Worker RPCs (claim / record / complete / fail)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_email_service_role()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'email outbox operations are service-role only';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_email_events(p_limit integer DEFAULT 10)
RETURNS SETOF public.email_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_email_service_role();

  RETURN QUERY
  WITH ready AS (
    SELECT id
    FROM public.email_events
    WHERE (status = 'pending' AND next_attempt_at <= now())
       -- Reclaim events whose worker crashed mid-run.
       OR (status = 'processing' AND coalesce(claimed_at, updated_at) < now() - interval '10 minutes')
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 10), 50))
  )
  UPDATE public.email_events e
  SET status = 'processing',
      attempts = e.attempts + 1,
      claimed_at = now(),
      updated_at = now()
  FROM ready
  WHERE e.id = ready.id
  RETURNING e.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_email_delivery(
  p_event_id    uuid,
  p_recipient   text,
  p_kind        text,
  p_status      text,
  p_user_id     uuid DEFAULT NULL,
  p_error       text DEFAULT NULL,
  p_provider_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_recipient, '')));
  v_inserted boolean;
BEGIN
  PERFORM public.assert_email_service_role();
  IF v_email = '' THEN
    RAISE EXCEPTION 'recipient is required';
  END IF;

  INSERT INTO public.email_deliveries AS d
    (event_id, recipient_email, recipient_kind, recipient_user_id, status, attempts,
     last_error, provider_message_id, sent_at)
  VALUES
    (p_event_id, v_email, p_kind, p_user_id, p_status, 1,
     p_error, p_provider_id, CASE WHEN p_status = 'sent' THEN now() END)
  ON CONFLICT (event_id, recipient_email) DO UPDATE
    SET status = CASE WHEN d.status = 'sent' THEN d.status ELSE excluded.status END,
        attempts = d.attempts + 1,
        last_error = excluded.last_error,
        provider_message_id = coalesce(d.provider_message_id, excluded.provider_message_id),
        sent_at = coalesce(d.sent_at, excluded.sent_at),
        updated_at = now()
    WHERE d.status <> 'sent'
  RETURNING (xmax = 0) INTO v_inserted;

  RETURN coalesce(v_inserted, false);
END;
$$;

-- True when this recipient was already delivered for this event.
CREATE OR REPLACE FUNCTION public.email_delivery_already_sent(p_event_id uuid, p_recipient text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_email_service_role();
  RETURN EXISTS (
    SELECT 1 FROM public.email_deliveries
    WHERE event_id = p_event_id
      AND recipient_email = lower(btrim(coalesce(p_recipient, '')))
      AND status = 'sent'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_email_event(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_email_service_role();
  UPDATE public.email_events
  SET status = 'done', last_error = NULL, updated_at = now()
  WHERE id = p_event_id;
END;
$$;

-- Bounded exponential backoff: 1, 2, 4, 8, 16 minutes, then permanently failed.
CREATE OR REPLACE FUNCTION public.fail_email_event(
  p_event_id  uuid,
  p_error     text,
  p_retryable boolean DEFAULT true
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts integer;
  v_status   text;
BEGIN
  PERFORM public.assert_email_service_role();

  SELECT attempts INTO v_attempts FROM public.email_events WHERE id = p_event_id;
  IF v_attempts IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_retryable AND v_attempts < 5 THEN
    v_status := 'pending';
    UPDATE public.email_events
    SET status = 'pending',
        last_error = left(coalesce(p_error, ''), 500),
        next_attempt_at = now() + (interval '1 minute' * power(2, greatest(v_attempts - 1, 0))),
        updated_at = now()
    WHERE id = p_event_id;
  ELSE
    v_status := 'failed';
    UPDATE public.email_events
    SET status = 'failed',
        last_error = left(coalesce(p_error, ''), 500),
        updated_at = now()
    WHERE id = p_event_id;
  END IF;

  RETURN v_status;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Operational synthetic test event
-- ---------------------------------------------------------------------------
-- Queues a clearly synthetic [TEST] admin alert. It creates NO user, trip,
-- subscription or support record. The five allowed test types map onto the five
-- admin templates, and the recipient may only be one of the two operational
-- test addresses (the worker re-checks this against the admin allowlist).
CREATE OR REPLACE FUNCTION public.queue_test_email_event(
  p_test_type text,
  p_recipient text DEFAULT 'connect@cashridez.com'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin  boolean := false;
  v_recipient text := lower(btrim(coalesce(p_recipient, '')));
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    BEGIN
      v_is_admin := public.has_role(auth.uid(), 'admin');
    EXCEPTION WHEN others THEN
      v_is_admin := false;
    END;
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'test email events may only be queued by service_role or an admin';
    END IF;
  END IF;

  IF p_test_type NOT IN (
    'id_uploaded', 'trip_posted', 'trip_accepted', 'new_subscription', 'support_message'
  ) THEN
    RAISE EXCEPTION 'unknown test type: %', coalesce(p_test_type, '<null>');
  END IF;

  IF v_recipient NOT IN ('kwamiekaze@gmail.com', 'connect@cashridez.com') THEN
    RAISE EXCEPTION 'test emails may only be sent to the two operational test addresses';
  END IF;

  RETURN public.queue_email_event(
    'test_alert',
    'test:' || p_test_type || ':' || v_recipient || ':' || clock_timestamp()::text,
    jsonb_build_object('test_type', p_test_type, 'recipient', v_recipient, 'synthetic', true)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Privileges — Supabase grants anon/authenticated EXECUTE by default
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.queue_email_event(text, text, jsonb)',
    'public.assert_email_service_role()',
    'public.claim_email_events(integer)',
    'public.record_email_delivery(uuid, text, text, text, uuid, text, text)',
    'public.email_delivery_already_sent(uuid, text)',
    'public.complete_email_event(uuid)',
    'public.fail_email_event(uuid, text, boolean)',
    'public.queue_test_email_event(text, text)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- 7. Schedule the worker (pg_cron + pg_net), idempotently
-- ---------------------------------------------------------------------------
-- The worker URL is fixed. The job runs every minute so a queued event is
-- delivered within ~1 minute without any browser being open. The worker ignores
-- the request body entirely, so the posted '{}' carries no authority.
CREATE OR REPLACE FUNCTION public.schedule_email_worker(p_service_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := 'https://wnajjqsqmrpwyffbpgsj.supabase.co/functions/v1/process-email-notifications';
BEGIN
  PERFORM public.assert_email_service_role();

  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron is not installed; skipping schedule';
    RETURN;
  END IF;

  -- Idempotent: drop any previous incarnation of the job first.
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname IN ('email-notification-worker', 'process-email-notifications');

  PERFORM cron.schedule(
    'process-email-notifications',
    '* * * * *',
    format(
      $job$SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', %L
        ),
        body := '{}'::jsonb
      )$job$,
      v_url,
      'Bearer ' || p_service_key
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_email_worker(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schedule_email_worker(text) FROM anon;
REVOKE ALL ON FUNCTION public.schedule_email_worker(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_email_worker(text) TO service_role;
DROP FUNCTION IF EXISTS public.schedule_email_worker(text, text);
