-- Add driver tips banner columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS driver_tips_banner_seen boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS driver_tips_banner_seen_at timestamp with time zone;

-- Create analytics_events table for tracking
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  role text,
  event_name text NOT NULL,
  page_path text,
  metadata jsonb
);

-- Enable RLS
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert their own events
CREATE POLICY "Users can insert own analytics events"
ON public.analytics_events
FOR INSERT
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Allow admins to view all analytics events
CREATE POLICY "Admins can view all analytics events"
ON public.analytics_events
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name ON public.analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON public.analytics_events(created_at DESC);