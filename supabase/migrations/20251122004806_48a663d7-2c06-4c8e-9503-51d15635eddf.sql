-- Add trigger to also increment completed_trips_count when a user is rated
-- This ensures trips count as completed either when status changes OR when rated

CREATE OR REPLACE FUNCTION increment_trip_on_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When rider gets rated (driver_rating added), increment their trip count
  IF NEW.driver_rating IS NOT NULL AND (OLD.driver_rating IS NULL OR OLD IS NULL) THEN
    UPDATE profiles 
    SET completed_trips_count = completed_trips_count + 1
    WHERE id = NEW.rider_id 
    AND completed_trips_count < (
      SELECT COUNT(*) FROM ride_requests 
      WHERE (rider_id = NEW.rider_id OR assigned_driver_id = NEW.rider_id)
      AND (status = 'completed' OR driver_rating IS NOT NULL OR rider_rating IS NOT NULL)
    );
  END IF;
  
  -- When driver gets rated (rider_rating added), increment their trip count
  IF NEW.rider_rating IS NOT NULL AND (OLD.rider_rating IS NULL OR OLD IS NULL) AND NEW.assigned_driver_id IS NOT NULL THEN
    UPDATE profiles 
    SET completed_trips_count = completed_trips_count + 1
    WHERE id = NEW.assigned_driver_id 
    AND completed_trips_count < (
      SELECT COUNT(*) FROM ride_requests 
      WHERE (rider_id = NEW.assigned_driver_id OR assigned_driver_id = NEW.assigned_driver_id)
      AND (status = 'completed' OR driver_rating IS NOT NULL OR rider_rating IS NOT NULL)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for rating-based trip count
DROP TRIGGER IF EXISTS increment_trip_on_rating_trigger ON ride_requests;
CREATE TRIGGER increment_trip_on_rating_trigger
AFTER INSERT OR UPDATE ON ride_requests
FOR EACH ROW
EXECUTE FUNCTION increment_trip_on_rating();