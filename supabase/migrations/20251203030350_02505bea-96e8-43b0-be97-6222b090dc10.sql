-- Add column to track if user has dismissed the verification welcome dialog
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS verification_welcome_dismissed boolean DEFAULT false;