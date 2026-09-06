-- ===========================================================================
-- PENDING MIGRATION — NOT APPLIED
-- ===========================================================================
-- Atomic billing event receipt (leases + fencing tokens), DB-monotonic sync
-- ordering, atomic entitlement writes, and durable checkout attempts.
--
-- This file lives OUTSIDE supabase/migrations on purpose so nothing applies it
-- automatically. Review it, then apply it deliberately.
--
-- THE EDGE FUNCTIONS DEPEND ON THIS SQL. Without it every billing call returns
-- a retryable 503 and performs NO Stripe mutation and NO entitlement write.
-- Apply this migration BEFORE deploying the billing functions.
--
-- What it adds:
--   1. public.billing_events            - one row per Stripe event id, with a
--                                         lease + fencing token so a crashed
--                                         process cannot wedge an event in
--                                         'processing' forever
--   2. profiles.billing_sync_generation - reserved-before-read counter
--      profiles.billing_sync_applied    - highest generation actually applied
--   3. public.checkout_locks            - per-user lock with an owner token
--   4. public.checkout_attempts         - durable Stripe idempotency keys
--   5. reserve_billing_sync_generation()
--   6. claim_billing_event() / release_billing_event() / complete_billing_event()
--   7. apply_billing_entitlement()      - entitlement + notification + log +
--                                         receipt completion, one transaction
--   8. apply_billing_sync()             - same guard for the status endpoint
--   9. claim_checkout_slot() / release_checkout_slot()
--  10. begin/record/retire_checkout_attempt()
--
-- All functions are SECURITY DEFINER and EXECUTE is granted to service_role
-- ONLY. No anon/authenticated access.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Event receipt table (lease + fencing token)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_events (
  stripe_event_id text PRIMARY KEY,
  event_type      text NOT NULL,
  status          text NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing', 'succeeded', 'failed')),
  claim_token     uuid,
  lease_expires_at timestamptz,
  attempts        integer NOT NULL DEFAULT 1,
  error_message   text,
  claimed_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_events ADD COLUMN IF NOT EXISTS claim_token uuid;
ALTER TABLE public.billing_events ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

GRANT ALL ON public.billing_events TO service_role;

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view billing events" ON public.billing_events;
CREATE POLICY "Admins can view billing events"
  ON public.billing_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS billing_events_status_idx
  ON public.billing_events (status, lease_expires_at);

-- ---------------------------------------------------------------------------
-- 1b. Billing log dedupe guard
-- ---------------------------------------------------------------------------
-- Partial (historical rows may have a NULL stripe_event_id and must be kept).
-- Every ON CONFLICT below therefore repeats the WHERE predicate so Postgres can
-- infer THIS index; without the predicate the inference fails at runtime with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification".
CREATE UNIQUE INDEX IF NOT EXISTS billing_logs_event_type_unique
  ON public.billing_logs (stripe_event_id, event_type)
  WHERE stripe_event_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Ordering columns on profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_sync_generation bigint NOT NULL DEFAULT 0;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_sync_applied bigint NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 3. Per-user checkout lock (owner token / fencing)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checkout_locks (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_token text NOT NULL,
  locked_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

ALTER TABLE public.checkout_locks ADD COLUMN IF NOT EXISTS owner_token text;

GRANT ALL ON public.checkout_locks TO service_role;
ALTER TABLE public.checkout_locks ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only.

-- ---------------------------------------------------------------------------
-- 4. Durable checkout attempts (Stripe idempotency key lifecycle)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checkout_attempts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price_id         text NOT NULL,
  idempotency_key  text NOT NULL,
  session_id       text,
  status           text NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'retired')),
  retired_reason   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- At most ONE open attempt per user + price.
CREATE UNIQUE INDEX IF NOT EXISTS checkout_attempts_open_unique
  ON public.checkout_attempts (user_id, price_id)
  WHERE status = 'open';

GRANT ALL ON public.checkout_attempts TO service_role;
ALTER TABLE public.checkout_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only.

-- ---------------------------------------------------------------------------
-- 5. Reserve a DB-monotonic sync generation BEFORE reading Stripe
-- ---------------------------------------------------------------------------
-- Ordering by the Stripe event timestamp is unsafe: two events created in the
-- same second compare equal, and the status endpoint has no event at all.
CREATE OR REPLACE FUNCTION public.reserve_billing_sync_generation(p_user_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_generation bigint;
BEGIN
  UPDATE public.profiles
  SET billing_sync_generation = billing_sync_generation + 1
  WHERE id = p_user_id
  RETURNING billing_sync_generation INTO v_generation;

  IF v_generation IS NULL THEN
    RAISE EXCEPTION 'Profile % not found', p_user_id;
  END IF;

  RETURN v_generation;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_billing_sync_generation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_billing_sync_generation(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6a. Atomic event claim with a lease
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_billing_event(
  p_event_id      text,
  p_event_type    text,
  p_lease_seconds integer DEFAULT 120
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token  uuid := gen_random_uuid();
  v_row    public.billing_events%ROWTYPE;
BEGIN
  INSERT INTO public.billing_events (
    stripe_event_id, event_type, status, claim_token, lease_expires_at
  )
  VALUES (
    p_event_id, p_event_type, 'processing', v_token,
    now() + make_interval(secs => p_lease_seconds)
  )
  ON CONFLICT (stripe_event_id) DO NOTHING;

  IF FOUND THEN
    RETURN jsonb_build_object('outcome', 'claimed', 'token', v_token::text);
  END IF;

  SELECT * INTO v_row
  FROM public.billing_events
  WHERE stripe_event_id = p_event_id
  FOR UPDATE;

  IF v_row.status = 'succeeded' THEN
    RETURN jsonb_build_object('outcome', 'succeeded', 'token', NULL);
  END IF;

  -- Failed (explicitly released) OR a lease that expired because the previous
  -- process crashed: both are reclaimable. A live lease is NOT.
  IF v_row.status = 'failed'
     OR v_row.lease_expires_at IS NULL
     OR v_row.lease_expires_at < now() THEN
    UPDATE public.billing_events
    SET status = 'processing',
        claim_token = v_token,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        attempts = attempts + 1,
        claimed_at = now(),
        updated_at = now()
    WHERE stripe_event_id = p_event_id;
    RETURN jsonb_build_object('outcome', 'reclaimed', 'token', v_token::text);
  END IF;

  RETURN jsonb_build_object('outcome', 'processing', 'token', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_billing_event(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_billing_event(text, text, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 6b. Release a claim (lets Stripe's retry reprocess). Token required.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_billing_event(
  p_event_id      text,
  p_claim_token   text,
  p_error_message text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.billing_events
  SET status = 'failed',
      error_message = p_error_message,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE stripe_event_id = p_event_id
    AND status = 'processing'
    AND claim_token = p_claim_token::uuid;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.release_billing_event(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_billing_event(text, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6c. Close a receipt for a terminal path that changes no entitlement.
--     Atomic with its log row, so a skip can never leave 'processing'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_billing_event(
  p_event_id    text,
  p_claim_token text,
  p_event_type  text,
  p_user_id     uuid,
  p_log         jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.billing_events
  SET status = 'succeeded',
      completed_at = now(),
      lease_expires_at = NULL,
      error_message = NULL,
      updated_at = now()
  WHERE stripe_event_id = p_event_id
    AND claim_token = p_claim_token::uuid
    AND status = 'processing';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    -- We no longer own the claim: do not write anything.
    RETURN jsonb_build_object('completed', false, 'reason', 'claim_lost');
  END IF;

  INSERT INTO public.billing_logs (user_id, event_type, stripe_event_id, request_body)
  VALUES (p_user_id, p_event_type, p_event_id, p_log)
  ON CONFLICT (stripe_event_id, event_type) WHERE stripe_event_id IS NOT NULL
  DO NOTHING;

  RETURN jsonb_build_object('completed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_billing_event(text, text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_billing_event(text, text, text, uuid, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Shared entitlement writer (generation-guarded, grant-safe)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._apply_entitlement_locked(
  p_user_id              uuid,
  p_entitlement          jsonb,
  p_generation           bigint,
  p_expected_customer_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_applied_gen bigint;
  v_granted     boolean;
  v_customer    text;
  v_applied     boolean := false;
  v_stale       boolean := false;
BEGIN
  -- Customer-level serialization: lock the profile row for this transaction
  -- and re-read the grant so an admin grant made during the Stripe read wins.
  SELECT billing_sync_applied,
         (subscription_active AND subscription_status = 'premium'
            AND stripe_subscription_id IS NULL),
         stripe_customer_id
  INTO v_applied_gen, v_granted, v_customer
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile % not found', p_user_id;
  END IF;

  IF v_granted THEN
    RETURN jsonb_build_object('applied', false, 'stale', false, 'granted', true);
  END IF;

  IF p_expected_customer_id IS NOT NULL
     AND v_customer IS DISTINCT FROM p_expected_customer_id THEN
    RAISE EXCEPTION 'Customer mapping changed for profile % during sync', p_user_id;
  END IF;

  IF p_entitlement IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'stale', false, 'granted', false);
  END IF;

  -- STRICTLY greater: an older or equal generation never overwrites.
  IF p_generation > v_applied_gen THEN
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
        billing_sync_applied = p_generation
    WHERE id = p_user_id;
    v_applied := true;
  ELSE
    v_stale := true;
  END IF;

  RETURN jsonb_build_object('applied', v_applied, 'stale', v_stale, 'granted', false);
END;
$$;

REVOKE ALL ON FUNCTION public._apply_entitlement_locked(uuid, jsonb, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._apply_entitlement_locked(uuid, jsonb, bigint, text) TO service_role;

-- 7a. Status-endpoint writer (no event receipt involved).
CREATE OR REPLACE FUNCTION public.apply_billing_sync(
  p_user_id              uuid,
  p_generation           bigint,
  p_entitlement          jsonb,
  p_expected_customer_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public._apply_entitlement_locked(
    p_user_id, p_entitlement, p_generation, p_expected_customer_id
  );
$$;

REVOKE ALL ON FUNCTION public.apply_billing_sync(uuid, bigint, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_billing_sync(uuid, bigint, jsonb, text) TO service_role;

-- 7b. Webhook writer: entitlement + notification + log + receipt, one txn.
CREATE OR REPLACE FUNCTION public.apply_billing_entitlement(
  p_event_id             text,
  p_claim_token          text,
  p_event_type           text,
  p_user_id              uuid,
  p_entitlement          jsonb,
  p_generation           bigint,
  p_expected_customer_id text DEFAULT NULL,
  p_notification         jsonb DEFAULT NULL,
  p_log                  jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result   jsonb;
  v_updated  integer;
  v_notified integer;
BEGIN
  -- Fence first: if we lost the claim, write nothing at all.
  UPDATE public.billing_events
  SET status = 'succeeded',
      completed_at = now(),
      lease_expires_at = NULL,
      error_message = NULL,
      updated_at = now()
  WHERE stripe_event_id = p_event_id
    AND claim_token = p_claim_token::uuid
    AND status = 'processing';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Billing event % claim lost — refusing to apply', p_event_id;
  END IF;

  v_result := public._apply_entitlement_locked(
    p_user_id, p_entitlement, p_generation, p_expected_customer_id
  );

  -- Exactly one log row per (event, type). The unique index makes the
  -- notification below fire at most once even under concurrent redelivery.
  INSERT INTO public.billing_logs (user_id, event_type, stripe_event_id, request_body)
  VALUES (p_user_id, p_event_type, p_event_id, p_log)
  ON CONFLICT (stripe_event_id, event_type) WHERE stripe_event_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_notified = ROW_COUNT;

  IF p_notification IS NOT NULL
     AND (v_result->>'applied')::boolean
     AND v_notified = 1 THEN
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

  RETURN v_result;
-- Any exception propagates: the whole transaction (receipt completion,
-- entitlement, log and notification) rolls back together and the event is
-- left retryable rather than half-applied.
END;
$$;

REVOKE ALL ON FUNCTION public.apply_billing_entitlement(text, text, text, uuid, jsonb, bigint, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_billing_entitlement(text, text, text, uuid, jsonb, bigint, text, jsonb, jsonb) TO service_role;

-- Drop the old signatures so no caller can reach a version without fencing.
DROP FUNCTION IF EXISTS public.claim_billing_event(text, text);
DROP FUNCTION IF EXISTS public.release_billing_event(text, text);
DROP FUNCTION IF EXISTS public.apply_billing_entitlement(text, text, uuid, jsonb, bigint, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.claim_checkout_slot(uuid, integer);
DROP FUNCTION IF EXISTS public.release_checkout_slot(uuid);

-- ---------------------------------------------------------------------------
-- 8. Checkout serialization with an owner token
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_checkout_slot(
  p_user_id     uuid,
  p_owner_token text,
  p_ttl_seconds integer DEFAULT 60
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
BEGIN
  DELETE FROM public.checkout_locks WHERE expires_at < now();

  INSERT INTO public.checkout_locks (user_id, owner_token, expires_at)
  VALUES (p_user_id, p_owner_token, now() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (user_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN jsonb_build_object('granted', v_inserted = 1);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_checkout_slot(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_checkout_slot(uuid, text, integer) TO service_role;

-- Token-specific release: an expired holder cannot clear a NEWER lock.
CREATE OR REPLACE FUNCTION public.release_checkout_slot(
  p_user_id     uuid,
  p_owner_token text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.checkout_locks
  WHERE user_id = p_user_id
    AND owner_token = p_owner_token;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.release_checkout_slot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_checkout_slot(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Durable checkout attempts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.begin_checkout_attempt(
  p_user_id  uuid,
  p_price_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key        text;
  v_session_id text;
BEGIN
  SELECT idempotency_key, session_id
  INTO v_key, v_session_id
  FROM public.checkout_attempts
  WHERE user_id = p_user_id AND price_id = p_price_id AND status = 'open'
  FOR UPDATE;

  IF v_key IS NOT NULL THEN
    RETURN jsonb_build_object('key', v_key, 'session_id', v_session_id);
  END IF;

  v_key := 'checkout:' || p_user_id::text || ':' || gen_random_uuid()::text;

  INSERT INTO public.checkout_attempts (user_id, price_id, idempotency_key)
  VALUES (p_user_id, p_price_id, v_key);

  RETURN jsonb_build_object('key', v_key, 'session_id', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.begin_checkout_attempt(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_checkout_attempt(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_checkout_attempt(
  p_user_id    uuid,
  p_key        text,
  p_session_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.checkout_attempts
  SET session_id = p_session_id,
      updated_at = now()
  WHERE user_id = p_user_id
    AND idempotency_key = p_key
    AND status = 'open';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.record_checkout_attempt(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_checkout_attempt(uuid, text, text) TO service_role;

-- Only a DEFINITIVELY expired or completed attempt may be retired, which is
-- what allows a fresh idempotency key to be issued.
CREATE OR REPLACE FUNCTION public.retire_checkout_attempt(
  p_user_id uuid,
  p_key     text,
  p_reason  text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.checkout_attempts
  SET status = 'retired',
      retired_reason = p_reason,
      updated_at = now()
  WHERE user_id = p_user_id
    AND idempotency_key = p_key
    AND status = 'open';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.retire_checkout_attempt(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retire_checkout_attempt(uuid, text, text) TO service_role;

COMMIT;
