-- Add Stripe subscription fields to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Create function to decrement free uses when trip is completed
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

-- Create trigger to automatically decrement free uses
DROP TRIGGER IF EXISTS decrement_free_uses_trigger ON ride_requests;
CREATE TRIGGER decrement_free_uses_trigger
AFTER UPDATE ON ride_requests
FOR EACH ROW
EXECUTE FUNCTION decrement_free_uses();