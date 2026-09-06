-- ===========================================================================
-- PENDING MIGRATION — NOT APPLIED
-- ===========================================================================
-- Connection limit + acceptance security.
--
-- This file lives OUTSIDE supabase/migrations on purpose so that nothing
-- applies it automatically. Review it, then apply it deliberately BEFORE
-- deploying the accept-ride function changes.
--
-- What it fixes (all reproduced against a local Postgres engine):
--   * accept_ride_atomic(uuid,uuid,integer,boolean,uuid) is EXECUTE-able by
--     PUBLIC/anon today, and trusts p_driver_id blindly: anyone could assign
--     any driver to any open ride.
--   * The free-tier wall was enforced (partially, and only for the driver) in
--     the edge function against completed_trips_count. It is now enforced in
--     the database, for BOTH participants, against connected_trips_count.
--   * profiles has a plain "own row" UPDATE policy, so a signed-in user could
--     set subscription_active = true / connected_trips_count = 0 themselves.
--
-- Deliberate non-goals: no customer data is backfilled, reset or migrated.
-- Existing counters are left exactly as they are.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Constants
-- ---------------------------------------------------------------------------
-- Free tier: 3 lifetime CONNECTED trips, combined across the rider and driver
-- roles (one shared counter per profile). The 3rd connection is allowed, the
-- 4th is denied. Cancelling a connected trip does NOT give the count back.
CREATE OR REPLACE FUNCTION public.free_connection_limit()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 3 $$;

-- ---------------------------------------------------------------------------
-- 1. Connection ledger — makes counting idempotent per (trip, user)
-- ---------------------------------------------------------------------------
-- Without this, a trip that is re-opened and re-assigned counts twice.
CREATE TABLE IF NOT EXISTS public.trip_connections (
  ride_request_id uuid NOT NULL REFERENCES public.ride_requests(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('rider', 'driver')),
  connected_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ride_request_id, user_id)
);

REVOKE ALL ON public.trip_connections FROM PUBLIC;
GRANT SELECT ON public.trip_connections TO authenticated;
GRANT ALL ON public.trip_connections TO service_role;
ALTER TABLE public.trip_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own connections" ON public.trip_connections;
CREATE POLICY "Users read their own connections"
  ON public.trip_connections FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- Seed the ledger from trips that are ALREADY connected, so that re-opening an
-- old trip cannot double-charge anyone. This writes no counters.
INSERT INTO public.trip_connections (ride_request_id, user_id, role, connected_at)
SELECT rr.id, rr.rider_id, 'rider', COALESCE(rr.updated_at, now())
FROM public.ride_requests rr
WHERE rr.assigned_driver_id IS NOT NULL
  AND rr.status IN ('assigned', 'completed', 'cancelled')
ON CONFLICT DO NOTHING;

INSERT INTO public.trip_connections (ride_request_id, user_id, role, connected_at)
SELECT rr.id, rr.assigned_driver_id, 'driver', COALESCE(rr.updated_at, now())
FROM public.ride_requests rr
WHERE rr.assigned_driver_id IS NOT NULL
  AND rr.status IN ('assigned', 'completed', 'cancelled')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Canonical entitlement check
-- ---------------------------------------------------------------------------
-- Fails (raises) when the profile is missing — a missing profile must never be
-- read as "0 connections used, go ahead".
-- Private, unchecked implementation. EXECUTE is granted to service_role only;
-- SECURITY DEFINER callers (accept_ride_atomic) reach it as the function owner.
CREATE OR REPLACE FUNCTION public._connection_entitlement_unchecked(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_active   boolean;
  v_status   text;
  v_used     integer;
  v_sub_id   text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'connection_entitlement: user id is required';
  END IF;

  IF public.has_role(p_user_id, 'admin'::app_role) THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'admin', 'used', NULL);
  END IF;

  SELECT subscription_active, subscription_status, connected_trips_count,
         stripe_subscription_id
    INTO v_active, v_status, v_used, v_sub_id
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'connection_entitlement: profile % not found', p_user_id;
  END IF;

  -- Trusted entitlement: the flag AND a live Stripe status. Either one alone
  -- is not enough.
  IF v_active IS TRUE AND v_status IN ('active', 'trialing') THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'subscribed', 'used', v_used);
  END IF;

  -- Trusted ADMIN GRANT: 'premium' with the flag set and NO Stripe
  -- subscription. A 'premium' row that DOES carry a Stripe subscription id is
  -- not a grant and gets no unlimited access from this branch.
  IF v_active IS TRUE AND v_status = 'premium' AND v_sub_id IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'admin_grant', 'used', v_used);
  END IF;

  IF v_used IS NULL THEN
    RAISE EXCEPTION 'connection_entitlement: connected_trips_count is null for %', p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_used < public.free_connection_limit(),
    'reason',  CASE WHEN v_used < public.free_connection_limit() THEN 'free_tier' ELSE 'limit_reached' END,
    'used',    v_used
  );
END;
$$;

REVOKE ALL ON FUNCTION public._connection_entitlement_unchecked(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._connection_entitlement_unchecked(uuid) FROM anon;
REVOKE ALL ON FUNCTION public._connection_entitlement_unchecked(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._connection_entitlement_unchecked(uuid) TO service_role;

-- Caller check shared by the public entrypoints below. A user may read their
-- OWN entitlement; admins may read anyone's; trusted server code (service_role
-- JWT) may read anyone's. Everyone else — including anon — is refused, so the
-- RPC cannot be used to enumerate other people's counts or membership.
CREATE OR REPLACE FUNCTION public._assert_entitlement_readable(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role   text := auth.role();
BEGIN
  IF v_role = 'service_role' THEN
    RETURN;
  END IF;
  IF v_caller IS NOT NULL
     AND (v_caller = p_user_id OR public.has_role(v_caller, 'admin'::app_role)) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'not authorized to read entitlement for %', p_user_id
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public._assert_entitlement_readable(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._assert_entitlement_readable(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public._assert_entitlement_readable(uuid) TO authenticated, service_role;

-- Public entrypoint: same rule, but only for a caller allowed to see it.
CREATE OR REPLACE FUNCTION public.connection_entitlement(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._assert_entitlement_readable(p_user_id);
  RETURN public._connection_entitlement_unchecked(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.connection_entitlement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.connection_entitlement(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.connection_entitlement(uuid) TO authenticated, service_role;

-- Existing gate keeps its name and signature, but now uses the same rule and
-- the same caller check.
CREATE OR REPLACE FUNCTION public.can_use_trip_features(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._assert_entitlement_readable(p_user_id);
  RETURN (public._connection_entitlement_unchecked(p_user_id) ->> 'allowed')::boolean;
END;
$$;

REVOKE ALL ON FUNCTION public.can_use_trip_features(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_use_trip_features(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_use_trip_features(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.free_connection_limit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.free_connection_limit() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Idempotent connection counting
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_connected_trips()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF NEW.status = 'assigned'
     AND (OLD.status IS NULL OR OLD.status <> 'assigned')
     AND NEW.assigned_driver_id IS NOT NULL THEN

    INSERT INTO public.trip_connections (ride_request_id, user_id, role)
    VALUES (NEW.id, NEW.rider_id, 'rider')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 1 THEN
      UPDATE public.profiles
      SET connected_trips_count = COALESCE(connected_trips_count, 0) + 1
      WHERE id = NEW.rider_id;
    END IF;

    INSERT INTO public.trip_connections (ride_request_id, user_id, role)
    VALUES (NEW.id, NEW.assigned_driver_id, 'driver')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 1 THEN
      UPDATE public.profiles
      SET connected_trips_count = COALESCE(connected_trips_count, 0) + 1
      WHERE id = NEW.assigned_driver_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS track_connected_trips ON public.ride_requests;
CREATE TRIGGER track_connected_trips
AFTER UPDATE ON public.ride_requests
FOR EACH ROW EXECUTE FUNCTION public.increment_connected_trips();

-- ---------------------------------------------------------------------------
-- 4. Assignment can only happen through accept_ride_atomic
-- ---------------------------------------------------------------------------
-- A per-transaction grant row is written by accept_ride_atomic itself. Clients
-- cannot write it (no grants to anon/authenticated, and the table is not
-- reachable through the Data API), so a direct UPDATE that sets
-- status = 'assigned' or changes assigned_driver_id is rejected.
CREATE TABLE IF NOT EXISTS public.ride_assignment_grants (
  xid             bigint NOT NULL,
  ride_request_id uuid   NOT NULL,
  driver_id       uuid,
  granted_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (xid, ride_request_id)
);
REVOKE ALL ON public.ride_assignment_grants FROM PUBLIC;
GRANT ALL ON public.ride_assignment_grants TO service_role;
ALTER TABLE public.ride_assignment_grants ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: nothing but SECURITY DEFINER code touches it.

CREATE OR REPLACE FUNCTION public.has_ride_assignment_grant(p_ride_id uuid, p_driver_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ride_assignment_grants g
    WHERE g.xid = pg_current_xact_id()::text::bigint
      AND g.ride_request_id = p_ride_id
      AND g.driver_id IS NOT DISTINCT FROM p_driver_id
  )
$$;
REVOKE ALL ON FUNCTION public.has_ride_assignment_grant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_ride_assignment_grant(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_ride_assignment()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER on purpose: current_user tells us whether this UPDATE came
-- straight from a signed-in client (authenticated) or from trusted internal
-- code (the definer function's owner / service_role).
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF (NEW.status = 'assigned' AND OLD.status IS DISTINCT FROM 'assigned')
     OR (NEW.assigned_driver_id IS NOT NULL
         AND NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id) THEN

    -- Trusted internal writers.
    IF current_user NOT IN ('anon', 'authenticated') THEN
      RETURN NEW;
    END IF;

    -- Admin manual overrides in the admin UI stay allowed.
    IF v_actor IS NOT NULL AND public.has_role(v_actor, 'admin'::app_role) THEN
      RETURN NEW;
    END IF;

    IF public.has_ride_assignment_grant(NEW.id, NEW.assigned_driver_id) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Trips can only be assigned through accept_ride_atomic';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_ride_assignment ON public.ride_requests;
CREATE TRIGGER guard_ride_assignment
BEFORE UPDATE ON public.ride_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_ride_assignment();

-- ---------------------------------------------------------------------------
-- 5. accept_ride_atomic — same signature, real authorization + real quota
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_ride_atomic(
  p_ride_id uuid,
  p_driver_id uuid,
  p_eta_minutes integer,
  p_skip_active_check boolean DEFAULT false,
  p_accepted_offer_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor              uuid := auth.uid();
  v_is_service         boolean := (current_user = 'service_role');
  v_is_admin           boolean := false;
  v_rider_id           uuid;
  v_ride_status        ride_status;
  v_offer              record;
  v_driver             record;
  v_first              uuid;
  v_second             uuid;
  v_entitlement        jsonb;
  v_driver_active_ride uuid;
  v_active_ride_status ride_status;
  v_driver_completed   boolean;
BEGIN
  IF p_ride_id IS NULL OR p_driver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid request');
  END IF;

  IF v_actor IS NULL AND NOT v_is_service THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not authorized');
  END IF;

  IF v_actor IS NOT NULL THEN
    v_is_admin := public.has_role(v_actor, 'admin'::app_role);
  END IF;

  -- Lock the trip first.
  SELECT rider_id, status INTO v_rider_id, v_ride_status
  FROM public.ride_requests
  WHERE id = p_ride_id
  FOR UPDATE;

  IF v_rider_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ride not found');
  END IF;

  IF v_ride_status <> 'open' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ride is no longer available');
  END IF;

  IF v_rider_id = p_driver_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'You cannot accept your own trip');
  END IF;

  -- -------------------------------------------------------------------------
  -- Authorization. p_driver_id is NEVER taken on trust from a client.
  -- -------------------------------------------------------------------------
  IF v_is_admin OR (v_actor IS NULL AND v_is_service) THEN
    NULL; -- admin override / trusted server-side automation
  ELSIF v_actor = p_driver_id THEN
    -- Driver accepting for themselves. If they name an offer it has to be
    -- their own pending offer on this trip.
    IF p_accepted_offer_id IS NOT NULL THEN
      SELECT * INTO v_offer FROM public.counter_offers
      WHERE id = p_accepted_offer_id FOR UPDATE;
      IF NOT FOUND
         OR v_offer.ride_request_id <> p_ride_id
         OR v_offer.by_user_id <> p_driver_id
         OR v_offer.status <> 'pending' THEN
        RETURN jsonb_build_object('success', false, 'message', 'That offer is no longer available');
      END IF;
    END IF;
  ELSIF v_actor = v_rider_id THEN
    -- Rider accepting a driver's offer (including a counter-offer).
    IF p_accepted_offer_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'Select the offer you want to accept');
    END IF;
    SELECT * INTO v_offer FROM public.counter_offers
    WHERE id = p_accepted_offer_id FOR UPDATE;
    IF NOT FOUND
       OR v_offer.ride_request_id <> p_ride_id
       OR v_offer.by_user_id <> p_driver_id
       OR v_offer.status <> 'pending' THEN
      RETURN jsonb_build_object('success', false, 'message', 'That offer is no longer available');
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'message', 'Not authorized to accept this trip');
  END IF;

  -- -------------------------------------------------------------------------
  -- Participant locks, taken in a stable UUID order so two concurrent accepts
  -- can never both consume the same last free connection.
  -- -------------------------------------------------------------------------
  v_first  := LEAST(v_rider_id, p_driver_id);
  v_second := GREATEST(v_rider_id, p_driver_id);
  PERFORM 1 FROM public.profiles WHERE id = v_first FOR UPDATE;
  PERFORM 1 FROM public.profiles WHERE id = v_second FOR UPDATE;

  -- Driver eligibility (admins exempt).
  SELECT id, is_verified, verification_status, blocked, paused
    INTO v_driver
  FROM public.profiles WHERE id = p_driver_id;

  IF v_driver.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Driver profile not found');
  END IF;

  IF NOT v_is_admin THEN
    IF v_driver.blocked IS TRUE THEN
      RETURN jsonb_build_object('success', false, 'message', 'This account is blocked');
    END IF;
    IF v_driver.paused IS TRUE THEN
      RETURN jsonb_build_object('success', false, 'message', 'This account is paused');
    END IF;
    IF v_driver.is_verified IS NOT TRUE AND v_driver.verification_status IS DISTINCT FROM 'approved' THEN
      RETURN jsonb_build_object('success', false, 'message', 'The driver must be verified before accepting trips');
    END IF;
  END IF;

  -- Quota: BOTH participants must be entitled. Errors propagate (fail closed).
  v_entitlement := public._connection_entitlement_unchecked(v_rider_id);
  IF (v_entitlement ->> 'allowed')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'rider_limit_reached',
      'message', 'The rider has used all 3 free connected trips. A membership is required to connect again.');
  END IF;

  v_entitlement := public._connection_entitlement_unchecked(p_driver_id);
  IF (v_entitlement ->> 'allowed')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'driver_limit_reached',
      'message', 'The driver has used all 3 free connected trips. A membership is required to connect again.');
  END IF;

  -- Active-ride rule (unchanged behaviour, including the skip path).
  IF NOT COALESCE(p_skip_active_check, false) THEN
    SELECT active_assigned_ride_id INTO v_driver_active_ride
    FROM public.profiles WHERE id = p_driver_id;

    IF v_driver_active_ride IS NOT NULL THEN
      SELECT status, driver_completed INTO v_active_ride_status, v_driver_completed
      FROM public.ride_requests WHERE id = v_driver_active_ride;

      IF v_active_ride_status IN ('open', 'assigned') AND v_driver_completed = false THEN
        RETURN jsonb_build_object('success', false, 'message', 'You already have an active ride. Complete it first.');
      ELSE
        UPDATE public.profiles SET active_assigned_ride_id = NULL WHERE id = p_driver_id;
      END IF;
    END IF;
  END IF;

  -- Authorize this transaction's assignment write for the guard trigger.
  DELETE FROM public.ride_assignment_grants WHERE granted_at < now() - interval '1 hour';
  INSERT INTO public.ride_assignment_grants (xid, ride_request_id, driver_id)
  VALUES (pg_current_xact_id()::text::bigint, p_ride_id, p_driver_id)
  ON CONFLICT (xid, ride_request_id) DO UPDATE SET driver_id = EXCLUDED.driver_id;

  UPDATE public.ride_requests
  SET status = 'assigned',
      assigned_driver_id = p_driver_id,
      eta_minutes = COALESCE(p_eta_minutes, 0),
      updated_at = now()
  WHERE id = p_ride_id;

  UPDATE public.profiles
  SET active_assigned_ride_id = p_ride_id
  WHERE id = p_driver_id;

  IF p_accepted_offer_id IS NOT NULL THEN
    UPDATE public.counter_offers SET status = 'accepted' WHERE id = p_accepted_offer_id;
  END IF;

  UPDATE public.counter_offers
  SET status = 'rejected'
  WHERE ride_request_id = p_ride_id
    AND status = 'pending'
    AND (p_accepted_offer_id IS NULL OR id <> p_accepted_offer_id);

  RETURN jsonb_build_object('success', true, 'message', 'Ride accepted successfully');
END;
$function$;

-- Anonymous callers lose access entirely.
REVOKE ALL ON FUNCTION public.accept_ride_atomic(uuid, uuid, integer, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_ride_atomic(uuid, uuid, integer, boolean, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_ride_atomic(uuid, uuid, integer, boolean, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Server/admin-owned profile fields
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: when a signed-in client updates its own row through the
-- Data API, current_user is 'authenticated'. When one of the SECURITY DEFINER
-- triggers/functions (ratings, counters, entitlement writes, billing sync)
-- performs the update, current_user is the function owner instead — so trusted
-- internal writes pass without any client-settable flag.
CREATE OR REPLACE FUNCTION public.guard_protected_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW; -- trusted internal writer (definer function / service_role)
  END IF;

  IF v_actor IS NOT NULL AND public.has_role(v_actor, 'admin'::app_role) THEN
    RETURN NEW; -- admin UI keeps working
  END IF;

  IF NEW.stripe_customer_id             IS DISTINCT FROM OLD.stripe_customer_id
  OR NEW.stripe_subscription_id         IS DISTINCT FROM OLD.stripe_subscription_id
  OR NEW.subscription_active            IS DISTINCT FROM OLD.subscription_active
  OR NEW.subscription_status            IS DISTINCT FROM OLD.subscription_status
  OR NEW.subscription_started_at        IS DISTINCT FROM OLD.subscription_started_at
  OR NEW.subscription_expires_at        IS DISTINCT FROM OLD.subscription_expires_at
  OR NEW.subscription_current_period_end IS DISTINCT FROM OLD.subscription_current_period_end
  OR NEW.connected_trips_count          IS DISTINCT FROM OLD.connected_trips_count
  OR NEW.completed_trips_count          IS DISTINCT FROM OLD.completed_trips_count
  OR NEW.free_uses_remaining            IS DISTINCT FROM OLD.free_uses_remaining
  OR NEW.cancel_count                   IS DISTINCT FROM OLD.cancel_count
  OR NEW.warning_count                  IS DISTINCT FROM OLD.warning_count
  OR NEW.chat_message_count             IS DISTINCT FROM OLD.chat_message_count
  OR NEW.chat_blocked                   IS DISTINCT FROM OLD.chat_blocked
  OR NEW.driver_rating_avg              IS DISTINCT FROM OLD.driver_rating_avg
  OR NEW.driver_rating_count            IS DISTINCT FROM OLD.driver_rating_count
  OR NEW.rider_rating_avg               IS DISTINCT FROM OLD.rider_rating_avg
  OR NEW.rider_rating_count             IS DISTINCT FROM OLD.rider_rating_count
  OR NEW.is_verified                    IS DISTINCT FROM OLD.is_verified
  OR NEW.verification_status            IS DISTINCT FROM OLD.verification_status
  OR NEW.verification_reviewed_at       IS DISTINCT FROM OLD.verification_reviewed_at
  OR NEW.verification_reviewer_id       IS DISTINCT FROM OLD.verification_reviewer_id
  OR NEW.verification_notes             IS DISTINCT FROM OLD.verification_notes
  OR NEW.blocked                        IS DISTINCT FROM OLD.blocked
  OR NEW.blocked_at                     IS DISTINCT FROM OLD.blocked_at
  OR NEW.blocked_by                     IS DISTINCT FROM OLD.blocked_by
  OR NEW.blocked_reason                 IS DISTINCT FROM OLD.blocked_reason
  OR NEW.blocked_until                  IS DISTINCT FROM OLD.blocked_until
  OR NEW.paused                         IS DISTINCT FROM OLD.paused
  OR NEW.admin_locked_fields            IS DISTINCT FROM OLD.admin_locked_fields
  OR NEW.active_assigned_ride_id        IS DISTINCT FROM OLD.active_assigned_ride_id
  OR to_jsonb(NEW) -> 'is_member'                IS DISTINCT FROM to_jsonb(OLD) -> 'is_member'
  -- Added by billing.sql (applied first). Compared through jsonb so this guard
  -- also works if the billing columns are not present yet.
  OR to_jsonb(NEW) -> 'billing_sync_generation'  IS DISTINCT FROM to_jsonb(OLD) -> 'billing_sync_generation'
  OR to_jsonb(NEW) -> 'billing_sync_applied'     IS DISTINCT FROM to_jsonb(OLD) -> 'billing_sync_applied'
  THEN
    RAISE EXCEPTION 'This field is managed by CashRidez and cannot be changed here';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_protected_profile_fields ON public.profiles;
CREATE TRIGGER guard_protected_profile_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_protected_profile_fields();

COMMIT;
