-- Add missing block-related columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS blocked_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS blocked_reason text,
ADD COLUMN IF NOT EXISTS blocked_at timestamptz;

-- Create index for blocked users lookup
CREATE INDEX IF NOT EXISTS idx_profiles_blocked ON public.profiles(blocked) WHERE blocked = true;