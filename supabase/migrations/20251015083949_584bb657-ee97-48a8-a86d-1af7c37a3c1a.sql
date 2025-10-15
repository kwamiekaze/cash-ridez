-- Fix infinite recursion by creating security definer functions and fixing policies

-- 1. Create security definer function to check if user is participant in a ride
CREATE OR REPLACE FUNCTION public.is_ride_participant(_user_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM ride_requests
    WHERE ((rider_id = _user_id OR assigned_driver_id = _user_id)
           AND (rider_id = _profile_id OR assigned_driver_id = _profile_id))
  )
$$;

-- 2. Create security definer function to check verification status without recursion
CREATE OR REPLACE FUNCTION public.is_verified_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = _user_id AND is_verified = true
  )
$$;

-- 3. Create security definer function to check if user is verified rider
CREATE OR REPLACE FUNCTION public.is_verified_rider(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = _user_id AND is_verified = true AND is_rider = true
  )
$$;

-- 4. Drop and recreate the problematic profile policy
DROP POLICY IF EXISTS "Users can view ride participants" ON public.profiles;
CREATE POLICY "Users can view ride participants"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_ride_participant(auth.uid(), id));

-- 5. Drop and recreate ride_requests policies to use security definer functions
DROP POLICY IF EXISTS "Verified riders can create requests" ON public.ride_requests;
CREATE POLICY "Verified riders can create requests"
ON public.ride_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = rider_id AND public.is_verified_rider(auth.uid()));

DROP POLICY IF EXISTS "Verified users can view open requests" ON public.ride_requests;
CREATE POLICY "Verified users can view open requests"
ON public.ride_requests
FOR SELECT
TO authenticated
USING (status = 'open'::ride_status AND public.is_verified_user(auth.uid()));

-- 6. Create profile-pictures bucket for profile photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-pictures',
  'profile-pictures',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 7. Add RLS policies for profile-pictures bucket
CREATE POLICY "Users can upload their own profile picture"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-pictures'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own profile picture"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-pictures'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Profile pictures are publicly viewable"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'profile-pictures');

CREATE POLICY "Users can delete their own profile picture"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-pictures'
  AND (storage.foldername(name))[1] = auth.uid()::text
);