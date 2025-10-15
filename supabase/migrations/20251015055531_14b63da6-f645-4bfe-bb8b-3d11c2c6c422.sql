-- Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('id-verifications', 'id-verifications', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('ride-notes', 'ride-notes', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('chat-attachments', 'chat-attachments', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']);

-- Storage policies for ID verifications
CREATE POLICY "Users can upload their own ID"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'id-verifications' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view their own ID"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'id-verifications' AND
    (auth.uid()::text = (storage.foldername(name))[1] OR
     public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Admins can view all IDs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'id-verifications' AND
    public.has_role(auth.uid(), 'admin')
  );

-- Storage policies for ride notes
CREATE POLICY "Riders can upload ride notes"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'ride-notes' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Participants can view ride notes"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'ride-notes' AND
    EXISTS (
      SELECT 1 FROM public.ride_requests
      WHERE id::text = (storage.foldername(name))[2]
      AND (rider_id = auth.uid() OR assigned_driver_id = auth.uid())
    )
  );

-- Storage policies for chat attachments
CREATE POLICY "Participants can upload attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-attachments' AND
    EXISTS (
      SELECT 1 FROM public.ride_requests
      WHERE id::text = (storage.foldername(name))[1]
      AND (rider_id = auth.uid() OR assigned_driver_id = auth.uid())
    )
  );

CREATE POLICY "Participants can view attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chat-attachments' AND
    EXISTS (
      SELECT 1 FROM public.ride_requests
      WHERE id::text = (storage.foldername(name))[1]
      AND (rider_id = auth.uid() OR assigned_driver_id = auth.uid())
    )
  );