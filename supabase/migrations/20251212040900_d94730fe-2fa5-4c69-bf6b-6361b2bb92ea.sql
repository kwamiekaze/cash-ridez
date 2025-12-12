-- Fix RLS policies to allow rating on completed trips
-- Both rider and driver need to be able to update ratings even after trip is completed

-- Drop existing update policies
DROP POLICY IF EXISTS "Riders can update their rides" ON ride_requests;
DROP POLICY IF EXISTS "Drivers can update assigned rides" ON ride_requests;

-- Create new policies that include completed status for rating purposes
CREATE POLICY "Riders can update their rides"
ON ride_requests
FOR UPDATE
USING (
  rider_id = auth.uid() 
  AND status IN ('open', 'assigned', 'completed')
)
WITH CHECK (rider_id = auth.uid());

CREATE POLICY "Drivers can update assigned rides"
ON ride_requests
FOR UPDATE
USING (
  assigned_driver_id = auth.uid() 
  AND status IN ('assigned', 'completed')
)
WITH CHECK (assigned_driver_id = auth.uid());