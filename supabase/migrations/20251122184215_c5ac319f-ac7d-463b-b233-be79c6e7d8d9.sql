-- Add RLS policies for chat-attachments bucket

-- Allow participants to upload attachments for their active trips
CREATE POLICY "Participants can upload chat attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM ride_requests
    WHERE id::text = (storage.foldername(name))[2]
      AND status = 'assigned'
      AND (rider_id = auth.uid() OR assigned_driver_id = auth.uid())
  )
);

-- Allow participants to view attachments for their trips
CREATE POLICY "Participants can view chat attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND EXISTS (
    SELECT 1 FROM ride_requests
    WHERE id::text = (storage.foldername(name))[2]
      AND (rider_id = auth.uid() OR assigned_driver_id = auth.uid())
  )
);

-- Allow admins to view all chat attachments
CREATE POLICY "Admins can view all chat attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND has_role(auth.uid(), 'admin'::app_role)
);