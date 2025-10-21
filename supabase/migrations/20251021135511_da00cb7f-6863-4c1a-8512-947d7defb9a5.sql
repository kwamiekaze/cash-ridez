-- Add active_role field to profiles to track user's current role
ALTER TABLE public.profiles 
ADD COLUMN active_role text CHECK (active_role IN ('rider', 'driver')) DEFAULT NULL;

-- Add comment
COMMENT ON COLUMN public.profiles.active_role IS 'Tracks whether user is currently acting as rider or driver. Set when they complete their first trip in that role.';