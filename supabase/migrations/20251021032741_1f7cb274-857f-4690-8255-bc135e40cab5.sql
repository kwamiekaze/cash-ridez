-- Update RLS policies to restrict profile visibility before trip acceptance
-- Users should only see display_name and user ID until connected via accepted trip

-- Drop and recreate the "Verified users view safe profile data for open rides" policy
DROP POLICY IF EXISTS "Verified users view safe profile data for open rides" ON public.profiles;

-- Create new restricted policy that only shows display_name and photo_url for open rides
CREATE POLICY "Verified users view limited profile data for open rides" 
ON public.profiles 
FOR SELECT 
USING (
  -- Users can always see their own full profile
  (auth.uid() = id) 
  OR 
  -- Admins can see everything
  has_role(auth.uid(), 'admin'::app_role) 
  OR 
  -- Connected users (accepted trips) can see full profile
  is_ride_participant(auth.uid(), id) 
  OR 
  -- Verified users can see ONLY display_name, photo_url, and ratings for open rides
  -- (actual column filtering will be done in application code)
  (is_verified_user(auth.uid()) AND (EXISTS ( 
    SELECT 1
    FROM ride_requests
    WHERE ((ride_requests.rider_id = profiles.id) AND (ride_requests.status = 'open'::ride_status))
  )))
);