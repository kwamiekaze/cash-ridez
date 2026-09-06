-- ===========================================================================
-- PENDING MIGRATION — NOT APPLIED
-- ===========================================================================
-- Atomic billing event receipt + entitlement write + notification.
--
-- This file lives OUTSIDE supabase/migrations on purpose so nothing applies it
-- automatically. Review it, then apply it deliberately.
--
-- What it adds:
--   1. public.billing_events        - one row per Stripe event id (dedupe)
--   2. profiles.billing_sync_version- monotonic guard against out-of-order
--                                     callbacks overwriting a newer sync
--   3. public.checkout_locks        - per-user checkout serialization
--   4. claim_billing_event()        - atomic claim, false when already handled
--   5. release_billing_event()      - releases a claim so Stripe can retry
--   6. apply_billing_entitlement()  - single transaction: entitlement +
--                                     notification + log + event completion
--   7. claim_checkout_slot() / release_checkout_slot()
--
-- All functions are SECURITY DEFINER and EXECUTE is granted to service_role
-- ONLY. No anon/authenticated access.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Event receipt table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_events (
  stripe_event_id text PRIMARY KEY,
  event_type      text NOT NULL,
  status          text NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing', 'succeeded', 'failed')),
  attempts        integer NOT NULL DEFAULT 1,
  error_message   text,
  claimed_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.billing_events TO service_role;

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view billing events" ON public.billing_events;
CREATE POLICY "Admins can view billing events"
  ON public.billing_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS billing_events_status_idx
  ON public.billing_events (status, claimed_at);

-- ---------------------------------------------------------------------------
-- 2. Out-of-order protection on profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_sync_version bigint NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 3. Per-user checkout lock
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checkout_locks (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  locked_at  timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

GRANT ALL ON public.checkout_locks TO service_role;
ALTER TABLE public.checkout_locks ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only.

-- ---------------------------------------------------------------------------
-- 4. Atomic event claim
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_billing_event(
  p_event_id   text,
  p_event_type text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  INSERT INTO public.billing_events (stripe_event_id, event_type, status)
  VALUES (p_event_id, p_event_type, 'processing')
  ON CONFLICT (stripe_event_id) DO NOTHING;

  IF FOUND THEN
    RETURN true;   -- we inserted it: this delivery owns the event
  END IF;

  -- Someone else has the row. Only a previously FAILED (released) event may be
  -- retried, and the row is locked so two concurrent retries cannot both win.
  SELECT status INTO v_status
  FROM public.billing_events
  WHERE stripe_event_id = p_event_id
  FOR UPDATE;

  IF v_status = 'failed' THEN
    UPDATE public.billing_events
    SET status = 'processing',
        attempts = attempts + 1,
        claimed_at = now(),
        updated_at = now()
    WHERE stripe_event_id = p_event_id;
    RETURN true;
  END IF;

  RETURN false;    -- succeeded, or another delivery is processing right now
END;
$$;

REVOKE ALL ON FUNCTION public.claim_billing_event(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_billing_event(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Release a claim (lets Stripe's retry reprocess)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_billing_event(
  p_event_id      text,
  p_error_message text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.billing_events
  SET status = 'failed',
      error_message = p_error_message,
      updated_at = now()
  WHERE stripe_event_id = p_event_id
    AND status <> 'succeeded';
$$;

REVOKE ALL ON FUNCTION public.release_billing_event(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_billing_event(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Atomic entitlement + notification + log + completion
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_billing_entitlement(
  p_event_id     text,
  p_event_type   text,
  p_user_id      uuid,
  p_entitlement  jsonb,
  p_sync_version bigint,
  p_notification jsonb DEFAULT NULL,
  p_log          jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_version bigint;
  v_granted         boolean;
  v_applied         boolean := false;
BEGIN
  -- Customer-level serialization: lock the profile row for this transaction.
  SELECT billing_sync_version,
         (subscription_active AND subscription_status = 'premium'
            AND stripe_subscription_id IS NULL)
  INTO v_current_version, v_granted
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile % not found', p_user_id;
  END IF;

  IF v_granted THEN
    -- Admin-granted access is never revoked or altered by Stripe.
    p_entitlement := NULL;
  END IF;

  IF p_entitlement IS NOT NULL AND p_sync_version >= v_current_version THEN
    UPDATE public.profiles
    SET subscription_active = COALESCE((p_entitlement->>'subscription_active')::boolean,
                                       subscription_active),
        subscription_status = COALESCE(p_entitlement->>'subscription_status',
                                       subscription_status),
        subscription_current_period_end =
          CASE WHEN p_entitlement ? 'subscription_current_period_end'
               THEN NULLIF(p_entitlement->>'subscription_current_period_end','')::bigint
               ELSE subscription_current_period_end END,
        is_member = COALESCE((p_entitlement->>'is_member')::boolean, is_member),
        stripe_subscription_id =
          CASE WHEN p_entitlement ? 'stripe_subscription_id'
               THEN NULLIF(p_entitlement->>'stripe_subscription_id','')
               ELSE stripe_subscription_id END,
        billing_sync_version = p_sync_version
    WHERE id = p_user_id;
    v_applied := true;
  END IF;

  -- One notification per event id, inside the same transaction.
  IF p_notification IS NOT NULL AND v_applied THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.billing_logs
      WHERE stripe_event_id = p_event_id
        AND event_type = p_event_type
    ) THEN
      PERFORM public.create_notification(
        p_user_id,
        p_notification->>'p_type',
        p_notification->>'p_title',
        p_notification->>'p_message',
        p_notification->>'p_link',
        NULL,
        NULL
      );
    END IF;
  END IF;

  INSERT INTO public.billing_logs (user_id, event_type, stripe_event_id, request_body)
  VALUES (p_user_id, p_event_type, p_event_id, p_log);

  UPDATE public.billing_events
  SET status = 'succeeded',
      completed_at = now(),
      updated_at = now(),
      error_message = NULL
  WHERE stripe_event_id = p_event_id;

  RETURN jsonb_build_object(
    'applied', v_applied,
    'stale', (p_entitlement IS NOT NULL AND NOT v_applied AND NOT v_granted),
    'granted', COALESCE(v_granted, false)
  );
EXCEPTION WHEN OTHERS THEN
  -- Any failure rolls the whole receipt back: nothing is half-written and the
  -- event is not marked succeeded, so Stripe retries.
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_billing_entitlement(text, text, uuid, jsonb, bigint, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_billing_entitlement(text, text, uuid, jsonb, bigint, jsonb, jsonb) TO service_role;

-- Dedupe guard for the notification check above.
CREATE UNIQUE INDEX IF NOT EXISTS billing_logs_event_type_unique
  ON public.billing_logs (stripe_event_id, event_type)
  WHERE stripe_event_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. Checkout serialization
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_checkout_slot(
  p_user_id     uuid,
  p_ttl_seconds integer DEFAULT 60
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.checkout_locks WHERE expires_at < now();

  INSERT INTO public.checkout_locks (user_id, expires_at)
  VALUES (p_user_id, now() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (user_id) DO NOTHING;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_checkout_slot(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_checkout_slot(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.release_checkout_slot(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.checkout_locks WHERE user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.release_checkout_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_checkout_slot(uuid) TO service_role;

COMMIT;
