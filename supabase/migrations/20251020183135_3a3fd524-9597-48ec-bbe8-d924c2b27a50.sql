-- Allow verified users to view limited profile data for riders of open ride requests
CREATE POLICY "Verified users can view limited profile data for open ride requests"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM ride_requests
    WHERE ride_requests.rider_id = profiles.id
    AND ride_requests.status = 'open'
  )
  AND is_verified_user(auth.uid())
);