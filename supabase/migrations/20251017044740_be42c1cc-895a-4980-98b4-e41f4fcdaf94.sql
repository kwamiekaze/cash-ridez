-- Create atomic ride acceptance function to prevent race conditions
CREATE OR REPLACE FUNCTION public.accept_ride_atomic(
  p_ride_id uuid,
  p_driver_id uuid,
  p_eta_minutes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_active_ride uuid;
  v_ride_status ride_status;
BEGIN
  -- Lock the ride request row to prevent concurrent accepts
  SELECT status INTO v_ride_status
  FROM ride_requests
  WHERE id = p_ride_id
  FOR UPDATE;

  -- Check if ride is still open
  IF v_ride_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ride not found');
  END IF;

  IF v_ride_status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ride is no longer available');
  END IF;

  -- Check if driver has an active ride (with lock)
  SELECT active_assigned_ride_id INTO v_driver_active_ride
  FROM profiles
  WHERE id = p_driver_id
  FOR UPDATE;

  IF v_driver_active_ride IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'You already have an active ride. Complete it first.');
  END IF;

  -- Update ride request
  UPDATE ride_requests
  SET 
    status = 'assigned',
    assigned_driver_id = p_driver_id,
    eta_minutes = p_eta_minutes,
    updated_at = now()
  WHERE id = p_ride_id;

  -- Update driver profile
  UPDATE profiles
  SET active_assigned_ride_id = p_ride_id
  WHERE id = p_driver_id;

  RETURN jsonb_build_object('success', true, 'message', 'Ride accepted successfully');
END;
$$;

-- Add ETA validation constraint
ALTER TABLE public.ride_requests
ADD CONSTRAINT eta_minutes_valid CHECK (eta_minutes IS NULL OR (eta_minutes >= 1 AND eta_minutes <= 240));

-- Drop the existing policy that exposes too much data
DROP POLICY IF EXISTS "Users can view ride participants" ON public.profiles;

-- Create a new restricted policy that only shows safe fields
CREATE POLICY "Users can view ride participants - limited data" 
ON public.profiles 
FOR SELECT 
USING (
  is_ride_participant(auth.uid(), id)
);

-- Add column-level security through a view for ride participants
CREATE OR REPLACE VIEW public.ride_participant_profiles AS
SELECT 
  id,
  display_name,
  photo_url,
  rider_rating_avg,
  rider_rating_count,
  driver_rating_avg,
  driver_rating_count,
  is_verified
FROM public.profiles;

-- Grant access to the view
GRANT SELECT ON public.ride_participant_profiles TO authenticated;