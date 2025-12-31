-- =========================================================
-- FEATURE 1: Subscription wall based on CONNECTED trips (not completed)
-- A "connected trip" = trip with status 'assigned' or higher where both parties are matched
-- =========================================================

-- Add connected_trips_count column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS connected_trips_count INTEGER NOT NULL DEFAULT 0;

-- Create function to increment connected trips count when trip becomes assigned
CREATE OR REPLACE FUNCTION public.increment_connected_trips()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when status changes TO 'assigned' (not from)
  IF NEW.status = 'assigned' AND (OLD.status IS NULL OR OLD.status != 'assigned') THEN
    -- Increment for rider
    UPDATE profiles 
    SET connected_trips_count = connected_trips_count + 1
    WHERE id = NEW.rider_id;
    
    -- Increment for driver
    IF NEW.assigned_driver_id IS NOT NULL THEN
      UPDATE profiles 
      SET connected_trips_count = connected_trips_count + 1
      WHERE id = NEW.assigned_driver_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop old trigger if exists and create new one
DROP TRIGGER IF EXISTS track_connected_trips ON public.ride_requests;
CREATE TRIGGER track_connected_trips
AFTER UPDATE ON public.ride_requests
FOR EACH ROW
EXECUTE FUNCTION public.increment_connected_trips();

-- Update can_use_trip_features to use connected_trips_count instead of completed_trips_count
CREATE OR REPLACE FUNCTION public.can_use_trip_features(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_subscription_active BOOLEAN;
  v_subscription_status TEXT;
  v_connected_trips INTEGER;
BEGIN
  SELECT subscription_active, subscription_status, connected_trips_count
  INTO v_subscription_active, v_subscription_status, v_connected_trips
  FROM profiles
  WHERE id = p_user_id;
  
  -- Check if user has active premium subscription
  IF v_subscription_active = true AND 
     (v_subscription_status = 'active' OR v_subscription_status = 'trialing') THEN
    RETURN TRUE;
  END IF;
  
  -- If not subscribed, check connected trip count (max 3 free connected trips)
  RETURN COALESCE(v_connected_trips, 0) < 3;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Backfill connected_trips_count from existing data
-- Count trips where user was rider or driver in an assigned/completed trip
UPDATE profiles p
SET connected_trips_count = (
  SELECT COUNT(DISTINCT rr.id)
  FROM ride_requests rr
  WHERE (rr.rider_id = p.id OR rr.assigned_driver_id = p.id)
    AND rr.status IN ('assigned', 'completed', 'cancelled')
    AND rr.assigned_driver_id IS NOT NULL
);

-- =========================================================
-- FEATURE 5: Admin Notes on user profiles + phone override for calling
-- =========================================================

-- Create admin_user_notes table
CREATE TABLE IF NOT EXISTS public.admin_user_notes (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  notes TEXT,
  phone_override TEXT,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_user_notes ENABLE ROW LEVEL SECURITY;

-- Only admins can view, insert, update
CREATE POLICY "Admins can view admin notes" ON public.admin_user_notes
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert admin notes" ON public.admin_user_notes
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update admin notes" ON public.admin_user_notes
FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_admin_user_notes_user_id ON public.admin_user_notes(user_id);