-- Update RLS policy for ride_messages to allow drivers with offers to message
DROP POLICY IF EXISTS "Participants can send messages" ON ride_messages;

CREATE POLICY "Participants and offer makers can send messages"
ON ride_messages
FOR INSERT
WITH CHECK (
  sender_id = auth.uid() 
  AND (
    -- Assigned participants (existing logic)
    EXISTS (
      SELECT 1 FROM ride_requests
      WHERE ride_requests.id = ride_messages.ride_request_id
      AND (ride_requests.rider_id = auth.uid() OR ride_requests.assigned_driver_id = auth.uid())
    )
    OR
    -- Drivers who have made offers on this ride
    EXISTS (
      SELECT 1 FROM counter_offers
      WHERE counter_offers.ride_request_id = ride_messages.ride_request_id
      AND counter_offers.by_user_id = auth.uid()
      AND counter_offers.status = 'pending'
    )
  )
);

-- Update view policy to allow offer makers to view messages too
DROP POLICY IF EXISTS "Participants and admins can view messages" ON ride_messages;

CREATE POLICY "Participants, offer makers, and admins can view messages"
ON ride_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM ride_requests
    WHERE ride_requests.id = ride_messages.ride_request_id
    AND (ride_requests.rider_id = auth.uid() OR ride_requests.assigned_driver_id = auth.uid())
  )
  OR
  -- Drivers who have made offers can view messages
  EXISTS (
    SELECT 1 FROM counter_offers
    WHERE counter_offers.ride_request_id = ride_messages.ride_request_id
    AND counter_offers.by_user_id = auth.uid()
    AND counter_offers.status = 'pending'
  )
  OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- Storage policies for chat-attachments bucket
DROP POLICY IF EXISTS "Participants and offer makers can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Participants and offer makers can view attachments" ON storage.objects;

CREATE POLICY "Participants and offer makers can upload attachments"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND (
    -- User is a participant in at least one ride
    EXISTS (
      SELECT 1 FROM ride_requests
      WHERE ride_requests.rider_id = auth.uid() OR ride_requests.assigned_driver_id = auth.uid()
    )
    OR
    -- User has made an offer
    EXISTS (
      SELECT 1 FROM counter_offers
      WHERE counter_offers.by_user_id = auth.uid()
    )
  )
);

CREATE POLICY "Participants and offer makers can view attachments"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'chat-attachments'
  AND (
    -- Check if user is participant in the ride referenced in the path
    auth.uid() IN (
      SELECT ride_requests.rider_id FROM ride_requests
      WHERE ride_requests.id::text = (storage.foldername(name))[2]
      UNION
      SELECT ride_requests.assigned_driver_id FROM ride_requests
      WHERE ride_requests.id::text = (storage.foldername(name))[2]
    )
    OR
    -- User has made offer on this ride
    EXISTS (
      SELECT 1 FROM counter_offers
      WHERE counter_offers.ride_request_id::text = (storage.foldername(name))[2]
      AND counter_offers.by_user_id = auth.uid()
    )
    OR
    has_role(auth.uid(), 'admin'::app_role)
  )
);