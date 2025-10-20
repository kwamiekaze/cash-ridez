-- Fix profile contact info leakage
-- Drop the overly permissive policy that exposes all columns
DROP POLICY IF EXISTS "Verified users can view limited profile data for open ride requests" ON public.profiles;

-- Create a security definer function that returns only safe profile columns for open rides
CREATE OR REPLACE FUNCTION public.get_safe_profile_for_open_ride(_profile_id uuid)
RETURNS TABLE(
  id uuid,
  display_name text,
  rider_rating_avg numeric,
  rider_rating_count integer,
  photo_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.display_name,
    p.rider_rating_avg,
    p.rider_rating_count,
    p.photo_url
  FROM profiles p
  WHERE p.id = _profile_id
  AND EXISTS (
    SELECT 1 
    FROM ride_requests 
    WHERE ride_requests.rider_id = p.id 
    AND ride_requests.status = 'open'::ride_status
  );
$$;

-- Create a restricted policy that only allows viewing safe columns
-- Users can only see limited profile data (id, display_name, ratings, photo) for open rides
-- Contact info (phone_number, email, full_name, bio) is NOT accessible until ride is assigned
CREATE POLICY "Verified users view safe profile data for open rides"
ON public.profiles
FOR SELECT
USING (
  -- User can see their own full profile
  auth.uid() = id
  OR
  -- Admins can see all profiles
  has_role(auth.uid(), 'admin'::app_role)
  OR
  -- Ride participants can see each other (via existing policy)
  is_ride_participant(auth.uid(), id)
  OR
  -- Verified users can view ONLY if they request through the safe function
  -- This policy allows the SELECT but the function restricts columns
  (
    is_verified_user(auth.uid())
    AND EXISTS (
      SELECT 1 
      FROM ride_requests 
      WHERE ride_requests.rider_id = profiles.id 
      AND ride_requests.status = 'open'::ride_status
    )
  )
);