-- Add location tracking columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS current_lat numeric,
ADD COLUMN IF NOT EXISTS current_lng numeric,
ADD COLUMN IF NOT EXISTS location_updated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS location_sharing_enabled boolean DEFAULT false;

-- Create index for location queries
CREATE INDEX IF NOT EXISTS idx_profiles_location ON public.profiles(current_lat, current_lng) WHERE location_sharing_enabled = true;

-- Create a table to store ride participant locations
CREATE TABLE IF NOT EXISTS public.ride_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ride_request_id uuid NOT NULL REFERENCES public.ride_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(ride_request_id, user_id)
);

-- Enable RLS on ride_locations
ALTER TABLE public.ride_locations ENABLE ROW LEVEL SECURITY;

-- Participants can view locations for their assigned rides
CREATE POLICY "Participants can view ride locations"
ON public.ride_locations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM ride_requests
    WHERE ride_requests.id = ride_locations.ride_request_id
    AND (ride_requests.rider_id = auth.uid() OR ride_requests.assigned_driver_id = auth.uid())
  )
);

-- Participants can insert/update their own location
CREATE POLICY "Participants can update own location"
ON public.ride_locations
FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM ride_requests
    WHERE ride_requests.id = ride_locations.ride_request_id
    AND (ride_requests.rider_id = auth.uid() OR ride_requests.assigned_driver_id = auth.uid())
    AND ride_requests.status = 'assigned'
  )
);

CREATE POLICY "Participants can update own location data"
ON public.ride_locations
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Enable realtime for ride_locations
ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_locations;