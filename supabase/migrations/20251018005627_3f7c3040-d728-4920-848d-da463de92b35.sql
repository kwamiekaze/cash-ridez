-- Drop the existing policy that requires is_rider
DROP POLICY IF EXISTS "Verified riders can create requests" ON ride_requests;

-- Create new policy that allows any verified user to create ride requests
CREATE POLICY "Verified users can create requests"
ON ride_requests
FOR INSERT
TO authenticated
WITH CHECK (
  (auth.uid() = rider_id) AND is_verified_user(auth.uid())
);