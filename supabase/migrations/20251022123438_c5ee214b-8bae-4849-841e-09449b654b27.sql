-- Public user ratings mirror for sitewide visibility
CREATE TABLE IF NOT EXISTS public.user_public_stats (
  user_id uuid PRIMARY KEY,
  rider_rating_avg numeric NOT NULL DEFAULT 0,
  rider_rating_count integer NOT NULL DEFAULT 0,
  driver_rating_avg numeric NOT NULL DEFAULT 0,
  driver_rating_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_public_stats ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read these aggregate stats
DROP POLICY IF EXISTS "Public can view user public stats" ON public.user_public_stats;
CREATE POLICY "Public can view user public stats"
ON public.user_public_stats
FOR SELECT
USING (true);

-- Keep the mirror table in sync with profiles ratings
CREATE OR REPLACE FUNCTION public.upsert_user_public_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_public_stats (user_id, rider_rating_avg, rider_rating_count, driver_rating_avg, driver_rating_count, updated_at)
  VALUES (NEW.id, COALESCE(NEW.rider_rating_avg,0), COALESCE(NEW.rider_rating_count,0),
          COALESCE(NEW.driver_rating_avg,0), COALESCE(NEW.driver_rating_count,0), now())
  ON CONFLICT (user_id) DO UPDATE
  SET rider_rating_avg = COALESCE(EXCLUDED.rider_rating_avg,0),
      rider_rating_count = COALESCE(EXCLUDED.rider_rating_count,0),
      driver_rating_avg = COALESCE(EXCLUDED.driver_rating_avg,0),
      driver_rating_count = COALESCE(EXCLUDED.driver_rating_count,0),
      updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_upsert_user_public_stats ON public.profiles;
CREATE TRIGGER trg_profiles_upsert_user_public_stats
AFTER INSERT OR UPDATE OF rider_rating_avg, rider_rating_count, driver_rating_avg, driver_rating_count
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.upsert_user_public_stats();

-- Initial backfill from existing profiles
INSERT INTO public.user_public_stats (user_id, rider_rating_avg, rider_rating_count, driver_rating_avg, driver_rating_count)
SELECT id, COALESCE(rider_rating_avg,0), COALESCE(rider_rating_count,0), COALESCE(driver_rating_avg,0), COALESCE(driver_rating_count,0)
FROM public.profiles
ON CONFLICT (user_id) DO UPDATE SET
  rider_rating_avg = EXCLUDED.rider_rating_avg,
  rider_rating_count = EXCLUDED.rider_rating_count,
  driver_rating_avg = EXCLUDED.driver_rating_avg,
  driver_rating_count = EXCLUDED.driver_rating_count,
  updated_at = now();