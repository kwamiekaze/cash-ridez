-- Create function to update rider rating average
CREATE OR REPLACE FUNCTION update_rider_rating()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate new average and count for rider
  UPDATE profiles
  SET 
    rider_rating_avg = (
      SELECT COALESCE(AVG(rider_rating), 0)
      FROM ride_requests
      WHERE rider_id = NEW.rider_id
        AND rider_rating IS NOT NULL
        AND status = 'completed'
    ),
    rider_rating_count = (
      SELECT COUNT(*)
      FROM ride_requests
      WHERE rider_id = NEW.rider_id
        AND rider_rating IS NOT NULL
        AND status = 'completed'
    )
  WHERE id = NEW.rider_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create function to update driver rating average
CREATE OR REPLACE FUNCTION update_driver_rating()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate new average and count for driver
  IF NEW.assigned_driver_id IS NOT NULL THEN
    UPDATE profiles
    SET 
      driver_rating_avg = (
        SELECT COALESCE(AVG(driver_rating), 0)
        FROM ride_requests
        WHERE assigned_driver_id = NEW.assigned_driver_id
          AND driver_rating IS NOT NULL
          AND status = 'completed'
      ),
      driver_rating_count = (
        SELECT COUNT(*)
        FROM ride_requests
        WHERE assigned_driver_id = NEW.assigned_driver_id
          AND driver_rating IS NOT NULL
          AND status = 'completed'
      )
    WHERE id = NEW.assigned_driver_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers for rating updates
DROP TRIGGER IF EXISTS trigger_update_rider_rating ON ride_requests;
CREATE TRIGGER trigger_update_rider_rating
  AFTER INSERT OR UPDATE OF rider_rating
  ON ride_requests
  FOR EACH ROW
  WHEN (NEW.rider_rating IS NOT NULL)
  EXECUTE FUNCTION update_rider_rating();

DROP TRIGGER IF EXISTS trigger_update_driver_rating ON ride_requests;
CREATE TRIGGER trigger_update_driver_rating
  AFTER INSERT OR UPDATE OF driver_rating
  ON ride_requests
  FOR EACH ROW
  WHEN (NEW.driver_rating IS NOT NULL)
  EXECUTE FUNCTION update_driver_rating();