-- ===========================================================================
-- PENDING MIGRATION — NOT APPLIED
-- ===========================================================================
-- 48-hour trip expiration.
--
-- DEPENDENCY: apply docs/pending-migrations/connections.sql FIRST. This file
-- relies on public.trip_connections (the per-user connection ledger) and on the
-- hardened accept_ride_atomic that already refuses stale trips while the row is
-- locked.
--
-- Rules implemented here:
--   * A ride whose posted pickup_time is more than 48 hours in the past becomes
--     'expired' — but ONLY while it is unfinished ('open' or 'assigned').
--     'completed' and 'cancelled' history is never touched.
--   * Expiring a trip must not consume a connected trip for either participant:
--     its ledger rows are removed and profiles.connected_trips_count is
--     recomputed from what remains of the ledger (never below zero).
--   * A driver's active_assigned_ride_id is cleared when it points at the
--     expired trip, and any still-pending counter offers are closed so the trip
--     cannot be accepted later.
--   * expire_stale_rides() is SECURITY DEFINER and NOT executable by clients.
--     pg_cron runs it every minute, so expiration lands within ~1 minute of the
--     48-hour threshold. A minute-level schedule keeps the database awake, which
--     costs more than an hourly job; it is the cadence the ~1-minute requirement
--     needs.
--   * Running the function repeatedly is a no-op after the first pass.
-- ===========================================================================

-- Enum value must be added outside the main transaction block so later
-- statements in this file can already cast to it.
ALTER TYPE public.ride_status ADD VALUE IF NOT EXISTS 'expired';

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Constants
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trip_expiry_interval()
RETURNS interval LANGUAGE sql IMMUTABLE AS $$ SELECT interval '48 hours' $$;

-- Operational helper: service_role only. Supabase's default function grants can
-- leave anon/authenticated EXECUTE behind, so revoke each role explicitly.
REVOKE ALL ON FUNCTION public.trip_expiry_interval() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trip_expiry_interval() FROM anon;
REVOKE ALL ON FUNCTION public.trip_expiry_interval() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.trip_expiry_interval() TO service_role;

CREATE INDEX IF NOT EXISTS ride_requests_unfinished_pickup_time_idx
  ON public.ride_requests (pickup_time)
  WHERE status IN ('open', 'assigned');

-- ---------------------------------------------------------------------------
-- 2. expire_stale_rides()
-- ---------------------------------------------------------------------------
-- Returns a small report: how many open / assigned trips were expired, how many
-- pending offers were closed, and how many profiles had a counter recomputed.
CREATE OR REPLACE FUNCTION public.expire_stale_rides()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cutoff       timestamptz := now() - public.trip_expiry_interval();
  v_open_ids     uuid[];
  v_assigned_ids uuid[];
  v_all_ids      uuid[];
  v_user_ids     uuid[];
  v_offers       integer := 0;
  v_profiles     integer := 0;
BEGIN
  -- Lock the stale unfinished rides in a stable order.
  SELECT COALESCE(array_agg(id ORDER BY id), '{}')
    INTO v_open_ids
  FROM (
    SELECT id FROM public.ride_requests
    WHERE status = 'open'
      AND pickup_time IS NOT NULL
      AND pickup_time < v_cutoff
    ORDER BY id
    FOR UPDATE
  ) s;

  SELECT COALESCE(array_agg(id ORDER BY id), '{}')
    INTO v_assigned_ids
  FROM (
    SELECT id FROM public.ride_requests
    WHERE status = 'assigned'
      AND pickup_time IS NOT NULL
      AND pickup_time < v_cutoff
    ORDER BY id
    FOR UPDATE
  ) s;

  v_all_ids := v_open_ids || v_assigned_ids;

  IF array_length(v_all_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'expired_open', 0, 'expired_assigned', 0,
      'offers_closed', 0, 'profiles_recounted', 0);
  END IF;

  -- Participants whose ledger rows are about to disappear.
  SELECT COALESCE(array_agg(DISTINCT tc.user_id), '{}')
    INTO v_user_ids
  FROM public.trip_connections tc
  WHERE tc.ride_request_id = ANY (v_all_ids);

  -- Lock the affected profiles in a stable UUID order before touching counters.
  IF array_length(v_user_ids, 1) IS NOT NULL THEN
    PERFORM 1 FROM public.profiles
    WHERE id = ANY (v_user_ids)
    ORDER BY id
    FOR UPDATE;
  END IF;

  DELETE FROM public.trip_connections
  WHERE ride_request_id = ANY (v_all_ids);

  -- Recompute from the surviving ledger. This can only ever land on a
  -- non-negative number, and touches nobody outside v_user_ids.
  IF array_length(v_user_ids, 1) IS NOT NULL THEN
    WITH recount AS (
      SELECT p.id,
             GREATEST(0, (SELECT count(*) FROM public.trip_connections tc
                          WHERE tc.user_id = p.id))::integer AS cnt
      FROM public.profiles p
      WHERE p.id = ANY (v_user_ids)
    )
    UPDATE public.profiles p
    SET connected_trips_count = r.cnt
    FROM recount r
    WHERE p.id = r.id
      AND p.connected_trips_count IS DISTINCT FROM r.cnt;
    GET DIAGNOSTICS v_profiles = ROW_COUNT;
  END IF;

  -- A driver must not stay "on" an expired trip.
  UPDATE public.profiles
  SET active_assigned_ride_id = NULL
  WHERE active_assigned_ride_id = ANY (v_all_ids);

  -- Close anything still pending so the trip cannot be accepted afterwards.
  UPDATE public.counter_offers
  SET status = 'rejected'
  WHERE ride_request_id = ANY (v_all_ids)
    AND status = 'pending';
  GET DIAGNOSTICS v_offers = ROW_COUNT;

  UPDATE public.ride_requests
  SET status = 'expired'::ride_status,
      updated_at = now()
  WHERE id = ANY (v_all_ids)
    AND status IN ('open', 'assigned');

  RETURN jsonb_build_object(
    'expired_open',       COALESCE(array_length(v_open_ids, 1), 0),
    'expired_assigned',   COALESCE(array_length(v_assigned_ids, 1), 0),
    'offers_closed',      v_offers,
    'profiles_recounted', v_profiles);
END;
$$;

-- Clients can never run this; it is an operational service RPC.
REVOKE ALL ON FUNCTION public.expire_stale_rides() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_stale_rides() FROM anon;
REVOKE ALL ON FUNCTION public.expire_stale_rides() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_rides() TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- 3. Backfill + schedule (one transaction, idempotent)
-- ---------------------------------------------------------------------------
-- The backfill runs BEFORE the (re)schedule and both live in the same
-- transaction: if either fails, no broken job is left scheduled.
BEGIN;

-- Backfill everything already past the threshold, using the same code path.
SELECT public.expire_stale_rides();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';

    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'expire-stale-rides';

    PERFORM cron.schedule(
      'expire-stale-rides',
      '* * * * *',
      'SELECT public.expire_stale_rides();');
  END IF;
END;
$$;

COMMIT;
