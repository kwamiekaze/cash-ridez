-- Add column for visibility history management
-- This allows admins to clear/hide historical location data from public view

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS map_history_hidden_from_public boolean DEFAULT false;

-- Add column to track when the history was cleared by an admin
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS map_history_cleared_at timestamp with time zone;

-- Add column to track who cleared the history (admin user ID)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS map_history_cleared_by uuid;

-- Create a comment for documentation
COMMENT ON COLUMN public.profiles.map_history_hidden_from_public IS 'When true, this user''s historical map locations are hidden from non-admin users';
COMMENT ON COLUMN public.profiles.map_history_cleared_at IS 'Timestamp when an admin cleared this user''s map visibility history';
COMMENT ON COLUMN public.profiles.map_history_cleared_by IS 'Admin user ID who cleared this user''s map visibility history';