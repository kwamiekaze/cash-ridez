-- Fix profile contact info leakage by restricting columns visible for open rides
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Verified users can view limited profile data for open ride requ" ON public.profiles;

-- Create a security definer function that returns only safe profile columns
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

-- Note: The existing policies already handle most cases correctly:
-- 1. "Users can view own profile" - users see their own full profile
-- 2. "Admins view all profiles with full access" - admins see all profiles
-- 3. "Users can view ride participants - limited data" - already uses is_ride_participant
-- The removed policy was the problematic one allowing all columns for open rides
-- Applications should use get_safe_profile_for_open_ride() function for open ride queries