-- Add subscription fields to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS subscription_active BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS subscription_current_period_end BIGINT,
ADD COLUMN IF NOT EXISTS completed_trips_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_member BOOLEAN DEFAULT FALSE;

-- Create index for faster subscription lookups
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription ON profiles(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_active ON profiles(subscription_active);

-- Create billing_logs table for error tracking
CREATE TABLE IF NOT EXISTS billing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  stripe_event_id TEXT,
  request_body JSONB,
  response_body JSONB,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on billing_logs
ALTER TABLE billing_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view all logs
CREATE POLICY "Admins can view all billing logs"
ON billing_logs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- System can insert logs
CREATE POLICY "System can insert billing logs"
ON billing_logs FOR INSERT
WITH CHECK (true);

-- Create function to increment completed trips
CREATE OR REPLACE FUNCTION increment_completed_trips()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Increment for rider
    UPDATE profiles 
    SET completed_trips_count = completed_trips_count + 1
    WHERE id = NEW.rider_id;
    
    -- Increment for driver
    UPDATE profiles 
    SET completed_trips_count = completed_trips_count + 1
    WHERE id = NEW.assigned_driver_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for completed trips
DROP TRIGGER IF EXISTS track_completed_trips ON ride_requests;
CREATE TRIGGER track_completed_trips
AFTER UPDATE ON ride_requests
FOR EACH ROW
EXECUTE FUNCTION increment_completed_trips();

-- Create function to check if user can create/accept trips
CREATE OR REPLACE FUNCTION can_use_trip_features(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_subscription_active BOOLEAN;
  v_completed_trips INTEGER;
BEGIN
  SELECT subscription_active, completed_trips_count
  INTO v_subscription_active, v_completed_trips
  FROM profiles
  WHERE id = p_user_id;
  
  -- If subscribed, always allow
  IF v_subscription_active THEN
    RETURN TRUE;
  END IF;
  
  -- If not subscribed, check trip count
  RETURN v_completed_trips < 3;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;