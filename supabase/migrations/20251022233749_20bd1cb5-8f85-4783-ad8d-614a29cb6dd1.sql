-- Fix search_path for decrement_free_uses function
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;