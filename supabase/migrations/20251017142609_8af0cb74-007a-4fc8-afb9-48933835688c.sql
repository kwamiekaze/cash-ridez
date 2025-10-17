-- Add status field to counter_offers table
ALTER TABLE public.counter_offers
ADD COLUMN status text NOT NULL DEFAULT 'pending'
CHECK (status IN ('pending', 'accepted', 'rejected'));

-- Create index for better query performance
CREATE INDEX idx_counter_offers_ride_request_id ON public.counter_offers(ride_request_id);
CREATE INDEX idx_counter_offers_status ON public.counter_offers(status);

-- Update RLS policies for counter_offers to allow both riders and drivers to view
DROP POLICY IF EXISTS "Participants can view offers" ON public.counter_offers;
DROP POLICY IF EXISTS "Participants can create offers" ON public.counter_offers;

-- Riders can view all offers on their ride requests
CREATE POLICY "Riders can view offers on their rides"
ON public.counter_offers
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM ride_requests
    WHERE ride_requests.id = counter_offers.ride_request_id
    AND ride_requests.rider_id = auth.uid()
  )
);

-- Drivers can view offers they created
CREATE POLICY "Drivers can view their own offers"
ON public.counter_offers
FOR SELECT
USING (by_user_id = auth.uid());

-- Verified users can create offers on open rides
CREATE POLICY "Verified users can create offers"
ON public.counter_offers
FOR INSERT
WITH CHECK (
  by_user_id = auth.uid()
  AND is_verified_user(auth.uid())
  AND EXISTS (
    SELECT 1 FROM ride_requests
    WHERE ride_requests.id = counter_offers.ride_request_id
    AND ride_requests.status = 'open'
  )
);

-- Riders can update offer status (accept/reject)
CREATE POLICY "Riders can update offer status"
ON public.counter_offers
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM ride_requests
    WHERE ride_requests.id = counter_offers.ride_request_id
    AND ride_requests.rider_id = auth.uid()
  )
);

-- Update ride_messages RLS to ensure participants can access chat
DROP POLICY IF EXISTS "Participants can view messages" ON public.ride_messages;
DROP POLICY IF EXISTS "Participants can send messages" ON public.ride_messages;

CREATE POLICY "Participants and admins can view messages"
ON public.ride_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM ride_requests
    WHERE ride_requests.id = ride_messages.ride_request_id
    AND (ride_requests.rider_id = auth.uid() OR ride_requests.assigned_driver_id = auth.uid())
  )
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Participants can send messages"
ON public.ride_messages
FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM ride_requests
    WHERE ride_requests.id = ride_messages.ride_request_id
    AND (ride_requests.rider_id = auth.uid() OR ride_requests.assigned_driver_id = auth.uid())
  )
);