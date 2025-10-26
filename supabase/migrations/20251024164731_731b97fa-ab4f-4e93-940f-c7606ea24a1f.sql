-- Performance indexes to speed up common queries
-- Ride requests: open list, connected, completed
CREATE INDEX IF NOT EXISTS idx_ride_requests_status_created_at ON public.ride_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ride_requests_assigned_updated ON public.ride_requests (assigned_driver_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ride_requests_rider_id ON public.ride_requests (rider_id);

-- Driver status lookups
CREATE INDEX IF NOT EXISTS idx_driver_status_updated_at ON public.driver_status (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_status_user_id ON public.driver_status (user_id);

-- Cancellation stats by user
CREATE INDEX IF NOT EXISTS idx_cancellation_stats_user_id ON public.cancellation_stats (user_id);

-- Optional: searching by profile_zip and notify flag used in features
CREATE INDEX IF NOT EXISTS idx_profiles_profile_zip ON public.profiles (profile_zip);
CREATE INDEX IF NOT EXISTS idx_profiles_notify_new_driver ON public.profiles (notify_new_driver);
