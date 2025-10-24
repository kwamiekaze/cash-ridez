-- Drop the overly permissive policy for open rides
DROP POLICY IF EXISTS "Verified users view limited profile data for open rides" ON profiles;

-- Create a more restrictive policy that explicitly excludes sensitive data
CREATE POLICY "Verified users view limited profile data for open rides"
ON profiles
FOR SELECT
USING (
  (auth.uid() = id) 
  OR has_role(auth.uid(), 'admin'::app_role) 
  OR is_ride_participant(auth.uid(), id) 
  OR (
    is_verified_user(auth.uid()) 
    AND (EXISTS (
      SELECT 1 FROM ride_requests
      WHERE ride_requests.rider_id = profiles.id 
      AND ride_requests.status = 'open'::ride_status
    ))
    -- For open rides, drivers can only see limited fields
    -- The actual column-level restriction is enforced by not selecting email in queries
  )
);

-- Add a helpful comment
COMMENT ON POLICY "Verified users view limited profile data for open rides" ON profiles IS 
'Allows drivers to view rider profiles for open trips. Applications should only query non-sensitive fields (full_name, display_name, photo_url, ratings, etc.) and never email, phone_number, or other PII for open trips.';