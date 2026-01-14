-- Add admin_cancellation_note column to ride_requests for admin cancellation notes
ALTER TABLE public.ride_requests 
ADD COLUMN IF NOT EXISTS admin_cancellation_note text;

-- Add comment for documentation
COMMENT ON COLUMN public.ride_requests.admin_cancellation_note IS 'Optional note provided by admin when cancelling a ride';