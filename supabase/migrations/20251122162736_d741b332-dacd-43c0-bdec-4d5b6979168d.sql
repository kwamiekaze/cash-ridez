-- Drop the existing problematic trigger and function
DROP TRIGGER IF EXISTS increment_trip_on_rating_trigger ON ride_requests;
DROP FUNCTION IF EXISTS increment_trip_on_rating();

-- Create new function to properly track completed trips
-- A trip counts as completed for a user when they either:
-- 1. Rate the other party, OR
-- 2. Mark the trip as complete on their end
CREATE OR REPLACE FUNCTION public.increment_completed_trips_on_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When a rider rates the driver (adds rider_rating), increment rider's count
  IF NEW.rider_rating IS NOT NULL AND (OLD.rider_rating IS NULL OR OLD IS NULL) THEN
    UPDATE profiles 
    SET completed_trips_count = completed_trips_count + 1
    WHERE id = NEW.rider_id;
  END IF;
  
  -- When a driver rates the rider (adds driver_rating), increment driver's count
  IF NEW.driver_rating IS NOT NULL AND (OLD.driver_rating IS NULL OR OLD IS NULL) AND NEW.assigned_driver_id IS NOT NULL THEN
    UPDATE profiles 
    SET completed_trips_count = completed_trips_count + 1
    WHERE id = NEW.assigned_driver_id;
  END IF;
  
  -- When rider marks complete, increment their count if not already counted
  IF NEW.rider_completed = true AND (OLD.rider_completed = false OR OLD IS NULL) AND NEW.rider_rating IS NULL THEN
    UPDATE profiles 
    SET completed_trips_count = completed_trips_count + 1
    WHERE id = NEW.rider_id;
  END IF;
  
  -- When driver marks complete, increment their count if not already counted
  IF NEW.driver_completed = true AND (OLD.driver_completed = false OR OLD IS NULL) AND NEW.driver_rating IS NULL AND NEW.assigned_driver_id IS NOT NULL THEN
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

-- Create trigger for the new function
CREATE TRIGGER track_completed_trips_trigger
BEFORE UPDATE ON ride_requests
FOR EACH ROW
EXECUTE FUNCTION public.increment_completed_trips_on_action();