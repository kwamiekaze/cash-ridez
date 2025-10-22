-- Add subscription and usage tracking fields to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS free_uses_remaining integer DEFAULT 3,
ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'free' CHECK (subscription_status IN ('free', 'premium')),
ADD COLUMN IF NOT EXISTS consecutive_cancellations integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS subscription_started_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS subscription_expires_at timestamp with time zone;

-- Create function to decrement free uses on trip completion
CREATE OR REPLACE FUNCTION decrement_free_uses()
RETURNS TRIGGER AS $$
BEGIN
  -- Only decrement for users who are not premium
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Decrement for rider if not premium
    UPDATE profiles 
    SET free_uses_remaining = GREATEST(0, free_uses_remaining - 1)
    WHERE id = NEW.rider_id 
    AND subscription_status = 'free'
    AND free_uses_remaining > 0;
    
    -- Decrement for driver if not premium
    UPDATE profiles 
    SET free_uses_remaining = GREATEST(0, free_uses_remaining - 1)
    WHERE id = NEW.assigned_driver_id 
    AND subscription_status = 'free'
    AND free_uses_remaining > 0;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for decrementing free uses
DROP TRIGGER IF EXISTS on_trip_completed ON ride_requests;
CREATE TRIGGER on_trip_completed
  AFTER UPDATE ON ride_requests
  FOR EACH ROW
  EXECUTE FUNCTION decrement_free_uses();

-- Create function to track consecutive cancellations
CREATE OR REPLACE FUNCTION track_cancellations()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    -- Increment consecutive cancellations for the cancelling user
    IF NEW.cancelled_by = 'rider' THEN
      UPDATE profiles 
      SET consecutive_cancellations = consecutive_cancellations + 1
      WHERE id = NEW.rider_id;
    ELSIF NEW.cancelled_by = 'driver' THEN
      UPDATE profiles 
      SET consecutive_cancellations = consecutive_cancellations + 1
      WHERE id = NEW.assigned_driver_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for tracking cancellations
DROP TRIGGER IF EXISTS on_trip_cancelled ON ride_requests;
CREATE TRIGGER on_trip_cancelled
  AFTER UPDATE ON ride_requests
  FOR EACH ROW
  EXECUTE FUNCTION track_cancellations();

-- Create function to reset consecutive cancellations on completion
CREATE OR REPLACE FUNCTION reset_cancellations_on_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Reset consecutive cancellations for both users
    UPDATE profiles 
    SET consecutive_cancellations = 0
    WHERE id IN (NEW.rider_id, NEW.assigned_driver_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for resetting cancellations
DROP TRIGGER IF EXISTS on_trip_completed_reset_cancellations ON ride_requests;
CREATE TRIGGER on_trip_completed_reset_cancellations
  AFTER UPDATE ON ride_requests
  FOR EACH ROW
  EXECUTE FUNCTION reset_cancellations_on_completion();