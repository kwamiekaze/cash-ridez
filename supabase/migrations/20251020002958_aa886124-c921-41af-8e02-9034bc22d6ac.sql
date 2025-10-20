-- Remove old role-based columns and update RLS policies for unified verified user access
-- Add active trip tracking

-- First, check for active trips before creating new ones
CREATE OR REPLACE FUNCTION public.check_active_ride(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM ride_requests
    WHERE (rider_id = _user_id OR assigned_driver_id = _user_id)
      AND status IN ('open', 'assigned')
  )
$$;

-- Drop old RLS policies that check for is_rider/is_driver
DROP POLICY IF EXISTS "Verified users can view open requests" ON ride_requests;
DROP POLICY IF EXISTS "Verified users can create requests" ON ride_requests;
DROP POLICY IF EXISTS "Riders can view their own requests" ON ride_requests;
DROP POLICY IF EXISTS "Assigned drivers can view their assigned rides" ON ride_requests;
DROP POLICY IF EXISTS "Riders can update own open requests" ON ride_requests;
DROP POLICY IF EXISTS "Assigned drivers can update their rides" ON ride_requests;

-- New unified RLS policies for ride_requests
CREATE POLICY "Verified users can view open requests"
ON ride_requests FOR SELECT
USING (status = 'open' AND is_verified_user(auth.uid()));

CREATE POLICY "Users can view their own requests"
ON ride_requests FOR SELECT
USING (rider_id = auth.uid());

CREATE POLICY "Users can view rides they're assigned to"
ON ride_requests FOR SELECT
USING (assigned_driver_id = auth.uid());

CREATE POLICY "Verified users can create requests"
ON ride_requests FOR INSERT
WITH CHECK (
  auth.uid() = rider_id 
  AND is_verified_user(auth.uid())
);

CREATE POLICY "Riders can update their own open requests"
ON ride_requests FOR UPDATE
USING (rider_id = auth.uid() AND status IN ('open', 'assigned'));

CREATE POLICY "Assigned users can update their rides"
ON ride_requests FOR UPDATE
USING (assigned_driver_id = auth.uid() AND status = 'assigned');

-- Update profiles to remove is_rider/is_driver (keep for backward compatibility but not enforce)
COMMENT ON COLUMN profiles.is_rider IS 'Deprecated: All verified users can post trips';
COMMENT ON COLUMN profiles.is_driver IS 'Deprecated: All verified users can accept trips';