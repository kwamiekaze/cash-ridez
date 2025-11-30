-- Drop and recreate the view policy to ensure it works for all users
DROP POLICY IF EXISTS "Anyone can view system message attachments" ON storage.objects;

-- Allow everyone (authenticated and anonymous) to view system message attachments
CREATE POLICY "Anyone can view system message attachments"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'system-message-attachments');