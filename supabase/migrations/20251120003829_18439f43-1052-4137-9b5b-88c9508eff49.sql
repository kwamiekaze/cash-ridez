-- Fix RLS policies to only allow messaging when connected (status = 'assigned')

-- Drop and recreate ride_messages policies with correct logic
DROP POLICY IF EXISTS "Users can send messages if participant or accepted driver" ON ride_messages;
DROP POLICY IF EXISTS "Users can view messages if participant or accepted driver" ON ride_messages;

-- Allow INSERT only if user is rider or assigned driver AND trip is assigned
CREATE POLICY "Users can send messages if connected on trip"
ON ride_messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM ride_requests
    WHERE ride_requests.id = ride_messages.ride_request_id
    AND ride_requests.status = 'assigned'
    AND (
      ride_requests.rider_id = auth.uid()
      OR ride_requests.assigned_driver_id = auth.uid()
    )
  )
);

-- Allow SELECT only if user is rider or assigned driver on the trip
CREATE POLICY "Users can view messages if connected on trip"
ON ride_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM ride_requests
    WHERE ride_requests.id = ride_messages.ride_request_id
    AND (
      ride_requests.rider_id = auth.uid()
      OR ride_requests.assigned_driver_id = auth.uid()
      OR has_role(auth.uid(), 'admin')
    )
  )
);

-- Fix storage policies for chat-attachments bucket
DROP POLICY IF EXISTS "Users can upload attachments if participant or driver with offer" ON storage.objects;
DROP POLICY IF EXISTS "Users can view attachments if participant or driver with offer" ON storage.objects;

-- Allow INSERT to chat-attachments only if connected on trip
CREATE POLICY "Users can upload attachments if connected on trip"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND EXISTS (
    SELECT 1 FROM ride_requests
    WHERE ride_requests.id::text = (storage.foldername(name))[1]
    AND ride_requests.status = 'assigned'
    AND (
      ride_requests.rider_id = auth.uid()
      OR ride_requests.assigned_driver_id = auth.uid()
    )
  )
);

-- Allow SELECT from chat-attachments if user is participant
CREATE POLICY "Users can view attachments if connected on trip"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND EXISTS (
    SELECT 1 FROM ride_requests
    WHERE ride_requests.id::text = (storage.foldername(name))[1]
    AND (
      ride_requests.rider_id = auth.uid()
      OR ride_requests.assigned_driver_id = auth.uid()
      OR has_role(auth.uid(), 'admin')
    )
  )
);