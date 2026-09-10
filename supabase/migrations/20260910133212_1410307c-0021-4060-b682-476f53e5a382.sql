
CREATE TABLE IF NOT EXISTS public.geocode_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_key text NOT NULL UNIQUE,
  display_name text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  zip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.geocode_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.geocode_cache TO service_role;
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "geocode_cache service only" ON public.geocode_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_geocode_cache_updated_at ON public.geocode_cache;
CREATE TRIGGER update_geocode_cache_updated_at
  BEFORE UPDATE ON public.geocode_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.geocode_rate_limit (
  slot text PRIMARY KEY,
  last_request_at timestamptz NOT NULL DEFAULT to_timestamp(0)
);

REVOKE ALL ON public.geocode_rate_limit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.geocode_rate_limit TO service_role;
ALTER TABLE public.geocode_rate_limit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "geocode_rate_limit service only" ON public.geocode_rate_limit
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.geocode_rate_limit (slot) VALUES ('nominatim')
  ON CONFLICT (slot) DO NOTHING;

-- Global single-flight token bucket: succeeds at most once per interval.
CREATE OR REPLACE FUNCTION public.reserve_geocode_slot(p_min_interval_ms integer DEFAULT 1000)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean := false;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS NOT NULL
     AND current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;

  UPDATE public.geocode_rate_limit
     SET last_request_at = now()
   WHERE slot = 'nominatim'
     AND now() - last_request_at >= make_interval(secs => GREATEST(p_min_interval_ms, 0) / 1000.0)
  RETURNING true INTO v_ok;

  RETURN COALESCE(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_geocode_slot(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_geocode_slot(integer) TO service_role;

-- One "new trip near you" alert per driver per ride, ever.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_new_trip_unique
  ON public.notifications (user_id, related_ride_id, type)
  WHERE type = 'new_trip' AND related_ride_id IS NOT NULL;
