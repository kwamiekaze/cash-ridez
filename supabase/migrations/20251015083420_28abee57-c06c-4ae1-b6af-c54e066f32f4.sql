-- Add RLS policies for id-verifications bucket
CREATE POLICY "Admins can view all ID verifications"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'id-verifications' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

CREATE POLICY "Users can upload their own ID verification"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'id-verifications'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own ID verification"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'id-verifications'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view their own ID verification"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'id-verifications'
  AND (storage.foldername(name))[1] = auth.uid()::text
);