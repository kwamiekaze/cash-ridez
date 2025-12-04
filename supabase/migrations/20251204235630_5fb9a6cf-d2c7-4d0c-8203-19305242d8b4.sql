-- Allow admins to view all counter offers
CREATE POLICY "Admins can view all offers"
ON public.counter_offers
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow verified users to view all offers on open trips (so drivers can see competition)
CREATE POLICY "Verified users can view offers on open trips"
ON public.counter_offers
FOR SELECT
USING (
  is_verified_user(auth.uid()) AND 
  EXISTS (
    SELECT 1 FROM ride_requests 
    WHERE ride_requests.id = counter_offers.ride_request_id 
    AND ride_requests.status = 'open'::ride_status
  )
);