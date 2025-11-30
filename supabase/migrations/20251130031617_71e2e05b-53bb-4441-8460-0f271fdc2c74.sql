-- Add attachment_url column to system_messages table
ALTER TABLE system_messages ADD COLUMN attachment_url TEXT;

-- Create storage bucket for system message attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'system-message-attachments',
  'system-message-attachments',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
);

-- RLS policies for system-message-attachments bucket
-- Everyone can view attachments (public bucket)
CREATE POLICY "Anyone can view system message attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'system-message-attachments');

-- Only admins can upload attachments
CREATE POLICY "Admins can upload system message attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'system-message-attachments' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Only admins can delete attachments
CREATE POLICY "Admins can delete system message attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'system-message-attachments' 
  AND has_role(auth.uid(), 'admin'::app_role)
);