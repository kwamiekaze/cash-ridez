-- ============================================================================
-- PENDING (NOT APPLIED) — masked calling hardening
-- ----------------------------------------------------------------------------
-- This file intentionally lives OUTSIDE supabase/migrations so it is not
-- auto-applied. Review, then apply through the normal migration flow.
--
-- MUST be applied BEFORE the calling edge functions are deployed: the code
-- fails closed (503) when these RPCs are missing — it never falls back to a
-- degraded path that would insert a call row or place a Twilio call.
--
-- It adds:
--   1. per-leg state columns + reservation token on public.calls
--   2. public.call_legs — the single registry that makes a Twilio SID globally
--      unique across BOTH legs of ALL calls (cross-column duplicates rejected)
--   3. service-role-only reservations with an advisory-locked, bounded lease
--      and a rate guard that counts CONFIRMED (Twilio-dialed) attempts only
--   4. atomic, row-locked RPCs for SID binding and leg status transitions with
--      an explicit allowed-transition graph, source precedence, sticky child
--      failure, write-once timestamps and a derived aggregate status
--   5. write lockdown: only the service role may insert/update call rows
-- ============================================================================

BEGIN;

-- 1. Per-leg state ------------------------------------------------------------
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS parent_status text,
  ADD COLUMN IF NOT EXISTS child_status  text,
  ADD COLUMN IF NOT EXISTS bridged       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reservation_token uuid;

ALTER TABLE public.calls
  DROP CONSTRAINT IF EXISTS calls_duration_nonnegative;
ALTER TABLE public.calls
  ADD CONSTRAINT calls_duration_nonnegative
  CHECK (duration_seconds IS NULL OR duration_seconds >= 0);

-- 2. SID registry -------------------------------------------------------------
-- One row per (call, leg). `sid` is UNIQUE over the whole table, so the same
-- SID can never appear twice — not on two calls, and not once as a rider leg
-- and once as a driver leg of the same call.
CREATE TABLE IF NOT EXISTS public.call_legs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id      uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  leg          text NOT NULL CHECK (leg IN ('parent', 'child')),
  sid          text NOT NULL UNIQUE CHECK (sid ~ '^CA[0-9a-f]{32}$'),
  account_sid  text NOT NULL CHECK (account_sid ~ '^AC[0-9a-f]{32}$'),
  parent_sid   text,
  status       text,
  status_source text,
  started_at   timestamptz,
  ended_at     timestamptz,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_id, leg)
);

GRANT ALL ON public.call_legs TO service_role;
ALTER TABLE public.call_legs ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: service-role only.

-- Legacy per-column uniqueness is kept as defence in depth. It cannot express
-- cross-column uniqueness, which is why call_legs exists.
CREATE UNIQUE INDEX IF NOT EXISTS calls_sid_rider_unique
  ON public.calls (twilio_call_sid_rider) WHERE twilio_call_sid_rider IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS calls_sid_driver_unique
  ON public.calls (twilio_call_sid_driver) WHERE twilio_call_sid_driver IS NOT NULL;

-- 3. Reservations -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.call_reservations (
  token        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid NOT NULL,
  trip_id      uuid NOT NULL,
  expires_at   timestamptz NOT NULL,
  confirmed_at timestamptz,
  released_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.call_reservations TO service_role;
ALTER TABLE public.call_reservations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS call_reservations_actor_created
  ON public.call_reservations (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS call_reservations_trip_live
  ON public.call_reservations (trip_id) WHERE released_at IS NULL;

CREATE OR REPLACE FUNCTION public.assert_service_role()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service-role only';
  END IF;
END;
$$;

-- Reserve exactly one live slot per trip.
-- Serialised with a transaction-scoped advisory lock on the trip, so expiry
-- cleanup and reservation can never race with a concurrent caller.
CREATE OR REPLACE FUNCTION public.reserve_call_slot(
  p_actor_id uuid,
  p_trip_id uuid,
  p_lease_seconds integer DEFAULT 90
)
RETURNS TABLE (outcome text, token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lease integer;
  v_recent integer;
  v_live integer;
  v_token uuid;
BEGIN
  PERFORM public.assert_service_role();

  -- Lease bounds are validated, never trusted from the caller.
  v_lease := least(greatest(coalesce(p_lease_seconds, 90), 15), 300);

  PERFORM pg_advisory_xact_lock(hashtextextended('call_slot:' || p_trip_id::text, 0));

  -- Expired leases are reclaimed atomically inside the same lock.
  UPDATE public.call_reservations
     SET released_at = now()
   WHERE trip_id = p_trip_id AND released_at IS NULL AND expires_at <= now();

  -- Rate guard: CONFIRMED attempts only (a reservation that never reached
  -- Twilio — bad config, DB failure, unreachable number — is not counted).
  SELECT count(*) INTO v_recent
    FROM public.call_reservations
   WHERE actor_id = p_actor_id
     AND confirmed_at IS NOT NULL
     AND confirmed_at > now() - interval '10 minutes';
  IF v_recent >= 5 THEN
    RETURN QUERY SELECT 'rate_limited'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT count(*) INTO v_live
    FROM public.call_reservations
   WHERE trip_id = p_trip_id AND released_at IS NULL AND expires_at > now();
  IF v_live > 0 THEN
    RETURN QUERY SELECT 'busy'::text, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.call_reservations (actor_id, trip_id, expires_at)
  VALUES (p_actor_id, p_trip_id, now() + make_interval(secs => v_lease))
  RETURNING call_reservations.token INTO v_token;

  RETURN QUERY SELECT 'granted'::text, v_token;
END;
$$;

-- Marks the attempt as actually dialed; only these count against the guard.
CREATE OR REPLACE FUNCTION public.confirm_call_attempt(p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_service_role();
  UPDATE public.call_reservations
     SET confirmed_at = coalesce(confirmed_at, now())
   WHERE token = p_token;
END;
$$;

-- Token-specific release: a stale token can never free somebody else's lease.
CREATE OR REPLACE FUNCTION public.release_call_slot(p_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  PERFORM public.assert_service_role();
  IF p_token IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.call_reservations
     SET released_at = now()
   WHERE token = p_token AND released_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- 4. Atomic SID binding -------------------------------------------------------
-- Locks the call row, checks the fencing token, the trip, the Twilio account
-- and (for a child) the exact parent SID, then binds the leg exactly once.
CREATE OR REPLACE FUNCTION public.bind_call_leg_sid(
  p_call_id uuid,
  p_leg text,
  p_sid text,
  p_account_sid text,
  p_parent_sid text,
  p_trip_id uuid,
  p_token uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call public.calls%ROWTYPE;
  v_column text;
  v_existing text;
  v_parent_bound text;
BEGIN
  PERFORM public.assert_service_role();

  IF p_leg NOT IN ('parent', 'child') THEN RAISE EXCEPTION 'invalid leg'; END IF;
  IF p_sid !~ '^CA[0-9a-f]{32}$' THEN RAISE EXCEPTION 'invalid sid'; END IF;
  IF p_account_sid !~ '^AC[0-9a-f]{32}$' THEN RAISE EXCEPTION 'invalid account sid'; END IF;

  SELECT * INTO v_call FROM public.calls WHERE id = p_call_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unknown_call'; END IF;
  IF p_trip_id IS NOT NULL AND v_call.trip_id IS DISTINCT FROM p_trip_id THEN
    RETURN 'trip_mismatch';
  END IF;
  IF p_token IS NOT NULL AND v_call.reservation_token IS DISTINCT FROM p_token THEN
    RETURN 'token_mismatch';
  END IF;

  IF v_call.initiated_by_user_id = v_call.rider_id THEN
    v_column := CASE WHEN p_leg = 'parent' THEN 'twilio_call_sid_rider' ELSE 'twilio_call_sid_driver' END;
  ELSE
    v_column := CASE WHEN p_leg = 'parent' THEN 'twilio_call_sid_driver' ELSE 'twilio_call_sid_rider' END;
  END IF;

  SELECT sid INTO v_existing FROM public.call_legs WHERE call_id = p_call_id AND leg = p_leg;
  IF v_existing IS NOT NULL THEN
    RETURN CASE WHEN v_existing = p_sid THEN 'already_bound' ELSE 'leg_conflict' END;
  END IF;

  IF p_leg = 'child' THEN
    SELECT sid INTO v_parent_bound FROM public.call_legs WHERE call_id = p_call_id AND leg = 'parent';
    IF v_parent_bound IS NULL OR p_parent_sid IS DISTINCT FROM v_parent_bound THEN
      RETURN 'parent_mismatch';
    END IF;
  ELSIF p_parent_sid IS NOT NULL THEN
    RETURN 'not_a_parent_leg';
  END IF;

  BEGIN
    INSERT INTO public.call_legs (call_id, leg, sid, account_sid, parent_sid)
    VALUES (p_call_id, p_leg, p_sid, p_account_sid, p_parent_sid);
  EXCEPTION WHEN unique_violation THEN
    RETURN 'sid_taken';
  END;

  EXECUTE format('UPDATE public.calls SET %I = $1, updated_at = now() WHERE id = $2', v_column)
    USING p_sid, p_call_id;

  RETURN 'bound';
END;
$$;

-- 5. Atomic leg status transitions -------------------------------------------
CREATE OR REPLACE FUNCTION public.call_status_rank(p_status text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'initiated'  THEN 1
    WHEN 'ringing'    THEN 2
    WHEN 'in_progress' THEN 3
    WHEN 'completed'  THEN 4
    WHEN 'busy'       THEN 4
    WHEN 'failed'     THEN 4
    WHEN 'no_answer'  THEN 4
    WHEN 'canceled'   THEN 4
    ELSE 0
  END;
$$;

-- Aggregate outcome. A completed PARENT leg with no child evidence is
-- 'unknown' — never an optimistic 'no_answer' or 'completed'.
CREATE OR REPLACE FUNCTION public.derive_call_status(
  p_parent text, p_child text, p_bridged boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_child IN ('busy', 'no_answer', 'failed', 'canceled') THEN p_child
    WHEN p_child = 'in_progress' THEN 'in_progress'
    WHEN p_child = 'completed' AND coalesce(p_bridged, false) THEN 'completed'
    WHEN p_child = 'completed' THEN 'carrier_answered'
    WHEN p_child = 'ringing' THEN 'ringing'
    WHEN coalesce(p_bridged, false) AND p_parent = 'completed' THEN 'completed'
    WHEN p_parent = 'completed' THEN 'unknown'
    WHEN p_parent IN ('busy', 'no_answer', 'failed', 'canceled') THEN p_parent
    WHEN p_parent IS NOT NULL THEN p_parent
    ELSE 'initiated'
  END;
$$;

-- Source precedence: the <Dial> action result may only finalise the CHILD leg
-- and never outranks a real child status callback that already reported a
-- terminal outcome. Child failure is sticky.
CREATE OR REPLACE FUNCTION public.apply_call_leg_status(
  p_call_id uuid,
  p_leg text,
  p_sid text,
  p_account_sid text,
  p_status text,
  p_source text,
  p_duration integer DEFAULT NULL
)
RETURNS TABLE (result text, aggregate_status text, parent_status text, child_status text, bridged boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call public.calls%ROWTYPE;
  v_leg public.call_legs%ROWTYPE;
  v_parent text;
  v_child text;
  v_bridged boolean;
  v_overall text;
  v_terminal boolean;
BEGIN
  PERFORM public.assert_service_role();

  IF p_leg NOT IN ('parent', 'child') THEN RAISE EXCEPTION 'invalid leg'; END IF;
  IF p_sid !~ '^CA[0-9a-f]{32}$' THEN RAISE EXCEPTION 'invalid sid'; END IF;
  IF p_account_sid !~ '^AC[0-9a-f]{32}$' THEN RAISE EXCEPTION 'invalid account sid'; END IF;
  IF public.call_status_rank(p_status) = 0 THEN RAISE EXCEPTION 'invalid status'; END IF;
  IF p_source NOT IN ('parent_status', 'child_status', 'dial_action') THEN
    RAISE EXCEPTION 'invalid source';
  END IF;

  SELECT * INTO v_call FROM public.calls WHERE id = p_call_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown_call'::text, NULL::text, NULL::text, NULL::text, NULL::boolean;
    RETURN;
  END IF;

  SELECT * INTO v_leg FROM public.call_legs
   WHERE call_id = p_call_id AND leg = p_leg FOR UPDATE;
  IF NOT FOUND OR v_leg.sid IS DISTINCT FROM p_sid OR v_leg.account_sid IS DISTINCT FROM p_account_sid THEN
    RETURN QUERY SELECT 'sid_mismatch'::text, NULL::text, NULL::text, NULL::text, NULL::boolean;
    RETURN;
  END IF;

  v_parent := v_call.parent_status;
  v_child := v_call.child_status;
  v_bridged := coalesce(v_call.bridged, false);

  -- Monotonic transition graph. Equal or lower rank never overwrites, so a
  -- late-arriving different terminal status cannot rewrite the first truth.
  IF v_leg.status IS NOT NULL
     AND public.call_status_rank(p_status) <= public.call_status_rank(v_leg.status) THEN
    RETURN QUERY SELECT
      CASE WHEN v_leg.status = p_status THEN 'duplicate' ELSE 'out_of_order' END,
      v_call.status, v_parent, v_child, v_bridged;
    RETURN;
  END IF;

  -- Sticky child failure: a dial action may not upgrade a failed child.
  IF p_leg = 'child' AND p_source = 'dial_action'
     AND v_child IN ('busy', 'no_answer', 'failed', 'canceled') THEN
    RETURN QUERY SELECT 'ignored_source'::text, v_call.status, v_parent, v_child, v_bridged;
    RETURN;
  END IF;

  v_terminal := p_status IN ('completed', 'busy', 'failed', 'no_answer', 'canceled');

  UPDATE public.call_legs
     SET status = p_status,
         status_source = p_source,
         started_at = CASE WHEN p_status = 'in_progress' THEN coalesce(started_at, now()) ELSE started_at END,
         ended_at   = CASE WHEN v_terminal THEN coalesce(ended_at, now()) ELSE ended_at END,
         duration_seconds = coalesce(duration_seconds, p_duration),
         updated_at = now()
   WHERE id = v_leg.id;

  IF p_leg = 'parent' THEN
    v_parent := p_status;
  ELSE
    v_child := p_status;
    IF p_status = 'in_progress' THEN v_bridged := true; END IF;
  END IF;

  v_overall := public.derive_call_status(v_parent, v_child, v_bridged);

  UPDATE public.calls
     SET parent_status = v_parent,
         child_status = v_child,
         bridged = v_bridged,
         status = v_overall,
         started_at = CASE WHEN p_leg = 'child' AND p_status = 'in_progress'
                           THEN coalesce(started_at, now()) ELSE started_at END,
         ended_at = CASE WHEN p_leg = 'parent' AND v_terminal
                         THEN coalesce(ended_at, now()) ELSE ended_at END,
         duration_seconds = CASE WHEN p_leg = 'parent' AND v_terminal
                                 THEN coalesce(duration_seconds, p_duration) ELSE duration_seconds END,
         updated_at = now()
   WHERE id = p_call_id;

  IF p_leg = 'parent' AND v_terminal THEN
    PERFORM public.release_call_slot(v_call.reservation_token);
  END IF;

  RETURN QUERY SELECT 'applied'::text, v_overall, v_parent, v_child, v_bridged;
END;
$$;

-- Failure stamp used when the edge function must abandon a call it created.
CREATE OR REPLACE FUNCTION public.fail_call(
  p_call_id uuid,
  p_token uuid,
  p_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call public.calls%ROWTYPE;
BEGIN
  PERFORM public.assert_service_role();
  SELECT * INTO v_call FROM public.calls WHERE id = p_call_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unknown_call'; END IF;
  IF p_token IS NOT NULL AND v_call.reservation_token IS DISTINCT FROM p_token THEN
    RETURN 'token_mismatch';
  END IF;

  UPDATE public.calls
     SET status = CASE WHEN coalesce(bridged, false) THEN status ELSE 'failed' END,
         ended_at = coalesce(ended_at, now()),
         updated_at = now()
   WHERE id = p_call_id;

  PERFORM public.release_call_slot(v_call.reservation_token);
  RETURN 'failed';
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_call_slot(uuid, uuid, integer) FROM public;
REVOKE ALL ON FUNCTION public.release_call_slot(uuid) FROM public;
REVOKE ALL ON FUNCTION public.confirm_call_attempt(uuid) FROM public;
REVOKE ALL ON FUNCTION public.bind_call_leg_sid(uuid, text, text, text, text, uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.apply_call_leg_status(uuid, text, text, text, text, text, integer) FROM public;
REVOKE ALL ON FUNCTION public.fail_call(uuid, uuid, text) FROM public;

GRANT EXECUTE ON FUNCTION public.reserve_call_slot(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_call_slot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_call_attempt(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_call_leg_sid(uuid, text, text, text, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_call_leg_status(uuid, text, text, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_call(uuid, uuid, text) TO service_role;

-- 6. Write lockdown on public.calls ------------------------------------------
DROP POLICY IF EXISTS "Users can create calls" ON public.calls;
DROP POLICY IF EXISTS "Users can insert calls" ON public.calls;
DROP POLICY IF EXISTS "Users can update calls" ON public.calls;
DROP POLICY IF EXISTS "Participants can update calls" ON public.calls;

REVOKE INSERT, UPDATE, DELETE ON public.calls FROM anon, authenticated;
GRANT SELECT ON public.calls TO authenticated;
GRANT ALL ON public.calls TO service_role;

DROP POLICY IF EXISTS "Participants and admins can view calls" ON public.calls;
CREATE POLICY "Participants and admins can view calls"
  ON public.calls FOR SELECT TO authenticated
  USING (
    auth.uid() = rider_id
    OR auth.uid() = driver_id
    OR public.has_role(auth.uid(), 'admin')
  );

COMMIT;
