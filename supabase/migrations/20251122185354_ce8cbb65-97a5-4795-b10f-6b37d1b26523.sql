-- Update chat-attachments bucket to be public
-- RLS policies still control who can upload and view files
UPDATE storage.buckets
SET public = true
WHERE id = 'chat-attachments';

-- Update the RLS policies to use correct folder structure
-- Remove the old policies first
DROP POLICY IF EXISTS "Participants can upload chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Participants can view chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all chat attachments" ON storage.objects;

-- Create updated policies with correct path structure
CREATE POLICY "Participants can upload chat attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND EXISTS (
    SELECT 1 FROM ride_requests
    WHERE id::text = (storage.foldername(name))[2]
      AND status = 'assigned'
      AND (rider_id = auth.uid() OR assigned_driver_id = auth.uid())
  )
);

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

CREATE POLICY "Admins can view all chat attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND has_role(auth.uid(), 'admin'::app_role)
);