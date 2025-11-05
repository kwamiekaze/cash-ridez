-- =====================================================
-- CASHRIDEZ COMPLETE SUPABASE MIGRATION SCRIPT
-- =====================================================
-- Copy and paste this entire file into your new Supabase SQL Editor
-- Execute it section by section or all at once
-- =====================================================

-- =====================================================
-- SECTION 1: EXTENSIONS
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =====================================================
-- SECTION 2: ENUMS
-- =====================================================

DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('user', 'driver', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ride_status AS ENUM ('open', 'assigned', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cancel_reason_code AS ENUM (
    'changed_mind',
    'found_other',
    'pricing',
    'schedule',
    'emergency',
    'safety',
    'weather',
    'vehicle_issue',
    'rider_no_show',
    'driver_no_show',
    'duplicate_request',
    'system_timeout',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- SECTION 3: STORAGE BUCKETS
-- =====================================================

-- Create buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('profile-pictures', 'profile-pictures', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']),
  ('id-verifications', 'id-verifications', false, 10485760, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/pdf']),
  ('ride-notes', 'ride-notes', false, 5242880, ARRAY['image/png', 'image/jpeg', 'image/jpg']),
  ('chat-attachments', 'chat-attachments', false, 10485760, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'application/pdf', 'text/plain'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =====================================================
-- SECTION 4: HELPER FUNCTIONS (needed for RLS)
-- =====================================================

-- Function: has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function: normalize_zip
CREATE OR REPLACE FUNCTION public.normalize_zip(zip_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF zip_input IS NULL THEN RETURN NULL; END IF;
  RETURN substring(regexp_replace(zip_input, '[^0-9]', '', 'g') from 1 for 5);
END;
$$;

-- Function: is_valid_zip
CREATE OR REPLACE FUNCTION public.is_valid_zip(zip_input text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF zip_input IS NULL THEN RETURN false; END IF;
  RETURN zip_input ~ '^[0-9]{5}$';
END;
$$;

-- =====================================================
-- SECTION 5: STORAGE RLS POLICIES
-- =====================================================

-- PROFILE PICTURES (PUBLIC BUCKET)
CREATE POLICY "Public can view profile pictures"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profile-pictures');

CREATE POLICY "Users can upload own profile picture"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-pictures' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own profile picture"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-pictures' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own profile picture"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-pictures' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ID VERIFICATIONS (PRIVATE BUCKET)
CREATE POLICY "Users can upload own ID documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'id-verifications' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view own ID documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'id-verifications' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can view all ID documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'id-verifications' 
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete ID documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'id-verifications' 
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- RIDE NOTES (PRIVATE BUCKET)
CREATE POLICY "Users can upload ride notes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ride-notes' 
  AND EXISTS (
    SELECT 1 FROM public.ride_requests
    WHERE rider_id = auth.uid()
    AND id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Participants can view ride notes"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'ride-notes' 
  AND (
    EXISTS (
      SELECT 1 FROM public.ride_requests
      WHERE id::text = (storage.foldername(name))[1]
      AND (rider_id = auth.uid() OR assigned_driver_id = auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Riders can delete own ride notes"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'ride-notes' 
  AND EXISTS (
    SELECT 1 FROM public.ride_requests
    WHERE rider_id = auth.uid()
    AND id::text = (storage.foldername(name))[1]
  )
);

-- CHAT ATTACHMENTS (PRIVATE BUCKET)
CREATE POLICY "Participants can upload chat attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments' 
  AND EXISTS (
    SELECT 1 FROM public.ride_requests
    WHERE id::text = (storage.foldername(name))[1]
    AND (rider_id = auth.uid() OR assigned_driver_id = auth.uid())
  )
);

CREATE POLICY "Participants can view chat attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-attachments' 
  AND (
    EXISTS (
      SELECT 1 FROM public.ride_requests
      WHERE id::text = (storage.foldername(name))[1]
      AND (rider_id = auth.uid() OR assigned_driver_id = auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

-- =====================================================
-- DONE! 🎉
-- =====================================================
-- Next steps:
-- 1. Verify all storage buckets appear in Storage section
-- 2. Test uploading files to each bucket
-- 3. Configure your edge functions (see supabase/functions/)
-- 4. Update your app's environment variables with new Supabase URL and keys
-- 5. Deploy edge functions using Supabase CLI or Lovable Cloud
-- =====================================================
