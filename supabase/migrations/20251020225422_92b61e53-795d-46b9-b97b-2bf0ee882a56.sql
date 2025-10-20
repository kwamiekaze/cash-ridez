-- Fix RLS to allow marking rides as completed/cancelled by either participant
-- Drop existing restrictive UPDATE policies
DROP POLICY IF EXISTS "Riders can update their own open requests" ON public.ride_requests;
DROP POLICY IF EXISTS "Assigned users can update their rides" ON public.ride_requests;

-- Recreate UPDATE policies with WITH CHECK that allows changing status to completed/cancelled
CREATE POLICY "Riders can update their rides (old open/assigned)"
ON public.ride_requests
FOR UPDATE
USING (
  rider_id = auth.uid() AND status IN ('open'::ride_status, 'assigned'::ride_status)
)
WITH CHECK (
  rider_id = auth.uid()
);

CREATE POLICY "Assigned drivers can update their rides (old assigned)"
ON public.ride_requests
FOR UPDATE
USING (
  assigned_driver_id = auth.uid() AND status = 'assigned'::ride_status
)
WITH CHECK (
  assigned_driver_id = auth.uid()
);
