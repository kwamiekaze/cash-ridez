-- Drop and recreate the trigger to fix double-counting issue
DROP TRIGGER IF EXISTS track_completed_trips_trigger ON ride_requests;
DROP FUNCTION IF EXISTS public.increment_completed_trips_on_action();

-- Create improved function that prevents double-counting
-- A trip counts as completed for a user when they take their FIRST action (rate OR mark complete)
CREATE OR REPLACE FUNCTION public.increment_completed_trips_on_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  
  -- Set trip status to completed when either both rated OR both marked complete
  IF (NEW.rider_rating IS NOT NULL AND NEW.driver_rating IS NOT NULL) OR 
     (NEW.rider_completed = true AND NEW.driver_completed = true) THEN
    NEW.status = 'completed';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER track_completed_trips_trigger
BEFORE UPDATE ON ride_requests
FOR EACH ROW
EXECUTE FUNCTION public.increment_completed_trips_on_action();