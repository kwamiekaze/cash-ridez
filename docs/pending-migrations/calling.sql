-- ============================================================================
-- PENDING (NOT APPLIED) — masked calling hardening
-- ----------------------------------------------------------------------------
-- This file intentionally lives OUTSIDE supabase/migrations so it is not
-- auto-applied. Review, then apply through the normal migration flow.
--
-- It adds:
--   1. explicit per-leg status columns + a bridged flag on public.calls
--   2. a service-role-only atomic call reservation (per actor + trip) with a
--      bounded lease, which blocks double clicks and concurrent second calls
--   3. SID uniqueness so a leg can never be bound to two records
--   4. write lockdown: only the service role may insert/update call rows;
--      participants and admins keep read access
-- ============================================================================

BEGIN;

-- 1. Per-leg state ------------------------------------------------------------
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS parent_status text,
  ADD COLUMN IF NOT EXISTS child_status  text,
  ADD COLUMN IF NOT EXISTS bridged       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reservation_token uuid;

-- Duration can never be negative.
ALTER TABLE public.calls
  DROP CONSTRAINT IF EXISTS calls_duration_nonnegative;
ALTER TABLE public.calls
  ADD CONSTRAINT calls_duration_nonnegative
  CHECK (duration_seconds IS NULL OR duration_seconds >= 0);

-- 3. A Twilio SID identifies exactly one leg of one call.
CREATE UNIQUE INDEX IF NOT EXISTS calls_sid_rider_unique
  ON public.calls (twilio_call_sid_rider) WHERE twilio_call_sid_rider IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS calls_sid_driver_unique
  ON public.calls (twilio_call_sid_driver) WHERE twilio_call_sid_driver IS NOT NULL;

-- 2. Reservations -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.call_reservations (
  token        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id      uuid NOT NULL REFERENCES public.ride_requests(id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,
  released_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.call_reservations TO service_role;
ALTER TABLE public.call_reservations ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: this table is service-role only.

CREATE INDEX IF NOT EXISTS call_reservations_actor_created
  ON public.call_reservations (actor_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS call_reservations_one_live_per_trip
  ON public.call_reservations (trip_id) WHERE released_at IS NULL;

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
  v_recent integer;
  v_token uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'reserve_call_slot is service-role only';
  END IF;

  -- Expire stale leases first (bounded lease, no permanent deadlock).
  UPDATE public.call_reservations
     SET released_at = now()
   WHERE released_at IS NULL AND expires_at < now();

  -- Rate guard: at most 5 call attempts per actor in 10 minutes.
  SELECT count(*) INTO v_recent
    FROM public.call_reservations
   WHERE actor_id = p_actor_id AND created_at > now() - interval '10 minutes';
  IF v_recent >= 5 THEN
    RETURN QUERY SELECT 'rate_limited'::text, NULL::uuid;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.call_reservations (actor_id, trip_id, expires_at)
    VALUES (p_actor_id, p_trip_id, now() + make_interval(secs => greatest(p_lease_seconds, 10)))
    RETURNING call_reservations.token INTO v_token;
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT 'busy'::text, NULL::uuid;
    RETURN;
  END;

  RETURN QUERY SELECT 'granted'::text, v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_call_slot(uuid, uuid, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_call_slot(uuid, uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.release_call_slot(p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'release_call_slot is service-role only';
  END IF;
  UPDATE public.call_reservations
     SET released_at = now()
   WHERE token = p_token AND released_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.release_call_slot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_call_slot(uuid) TO service_role;

-- 4. Write lockdown on public.calls ------------------------------------------
-- Participants and admins may READ their calls; nobody but the service role
-- may create or modify a call record.
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
