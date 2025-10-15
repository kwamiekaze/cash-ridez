-- Add moderation and tracking fields
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS warning_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS blocked_until timestamp with time zone;

-- Create message flags table for content moderation
CREATE TABLE IF NOT EXISTS public.user_message_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('message', 'ride_request')),
  content_id uuid NOT NULL,
  flagged_content text NOT NULL,
  flag_reason text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.user_message_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all flags"
ON public.user_message_flags FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert flags"
ON public.user_message_flags FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Fix profiles RLS to protect sensitive data
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Users can view their own full profile
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Users can view public data of ride participants
CREATE POLICY "Users can view ride participants"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.ride_requests
    WHERE (
      (ride_requests.rider_id = auth.uid() OR ride_requests.assigned_driver_id = auth.uid())
      AND (ride_requests.rider_id = profiles.id OR ride_requests.assigned_driver_id = profiles.id)
    )
  )
);

-- Admins can view all profiles
CREATE POLICY "Admins view all profiles"
ON public.profiles FOR SELECT  
USING (public.has_role(auth.uid(), 'admin'));

-- Add index for zip code filtering
CREATE INDEX IF NOT EXISTS idx_ride_requests_pickup_zip ON public.ride_requests(pickup_zip);
CREATE INDEX IF NOT EXISTS idx_ride_requests_created_at ON public.ride_requests(created_at DESC);