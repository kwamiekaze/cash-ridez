-- Update the trigger to mark trip as 'completed' immediately when EITHER party marks complete or rates
-- Drop all dependent triggers first using CASCADE

DROP TRIGGER IF EXISTS increment_completed_trips_on_action_trigger ON ride_requests;
DROP TRIGGER IF EXISTS track_completed_trips_trigger ON ride_requests;
DROP FUNCTION IF EXISTS increment_completed_trips_on_action() CASCADE;

CREATE OR REPLACE FUNCTION increment_completed_trips_on_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When a rider rates (first action if they haven't marked complete)
  IF NEW.rider_rating IS NOT NULL AND (OLD.rider_rating IS NULL OR OLD IS NULL) AND (OLD.rider_completed IS NULL OR OLD.rider_completed = false) THEN
    UPDATE profiles 
    SET completed_trips_count = completed_trips_count + 1
    WHERE id = NEW.rider_id;
  END IF;
  
  -- When a driver rates (first action if they haven't marked complete)
  IF NEW.driver_rating IS NOT NULL AND (OLD.driver_rating IS NULL OR OLD IS NULL) AND NEW.assigned_driver_id IS NOT NULL AND (OLD.driver_completed IS NULL OR OLD.driver_completed = false) THEN
    UPDATE profiles 
    SET completed_trips_count = completed_trips_count + 1
    WHERE id = NEW.assigned_driver_id;
  END IF;
  
  -- When rider marks complete (first action if they haven't rated)
  IF NEW.rider_completed = true AND (OLD.rider_completed IS NULL OR OLD.rider_completed = false) AND (OLD.rider_rating IS NULL) THEN
    UPDATE profiles 
    SET completed_trips_count = completed_trips_count + 1
    WHERE id = NEW.rider_id;
  END IF;
  
  -- When driver marks complete (first action if they haven't rated)
  IF NEW.driver_completed = true AND (OLD.driver_completed IS NULL OR OLD.driver_completed = false) AND NEW.assigned_driver_id IS NOT NULL AND (OLD.driver_rating IS NULL) THEN
    UPDATE profiles 
    SET completed_trips_count = completed_trips_count + 1
    WHERE id = NEW.assigned_driver_id;
  END IF;
  
  -- CRITICAL CHANGE: Set trip status to 'completed' when EITHER party marks complete OR rates
  -- This ensures immediate synchronization between driver and rider
  IF (NEW.rider_rating IS NOT NULL AND OLD.rider_rating IS NULL) OR 
     (NEW.driver_rating IS NOT NULL AND OLD.driver_rating IS NULL) OR
     (NEW.rider_completed = true AND (OLD.rider_completed IS NULL OR OLD.rider_completed = false)) OR
     (NEW.driver_completed = true AND (OLD.driver_completed IS NULL OR OLD.driver_completed = false)) THEN
    NEW.status = 'completed';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger with the updated function
CREATE TRIGGER track_completed_trips_trigger
BEFORE UPDATE ON ride_requests
FOR EACH ROW
EXECUTE FUNCTION increment_completed_trips_on_action();