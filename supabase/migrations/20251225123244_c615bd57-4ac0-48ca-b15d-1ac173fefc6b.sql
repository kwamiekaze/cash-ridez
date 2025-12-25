-- Add rider and driver tips tracking fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS rider_tips_visited boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS rider_tips_visited_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS driver_tips_visited boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS driver_tips_visited_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS rider_tips_dismissed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS rider_tips_dismissed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS driver_tips_dismissed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS driver_tips_dismissed_at timestamp with time zone;