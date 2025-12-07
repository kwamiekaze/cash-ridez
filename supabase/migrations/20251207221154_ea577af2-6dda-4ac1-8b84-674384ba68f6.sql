-- Add is_map_visible column to profiles table for Live Map visibility toggle
-- Default to true so existing users are visible by default

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_map_visible boolean DEFAULT true;