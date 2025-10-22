-- Ensure triggers exist for automatic rating updates
-- Drop existing triggers if they exist to recreate them
DROP TRIGGER IF EXISTS update_rider_rating_trigger ON ride_requests;
DROP TRIGGER IF EXISTS update_driver_rating_trigger ON ride_requests;

-- Create triggers to automatically update profile ratings when ride ratings change
CREATE TRIGGER update_rider_rating_trigger
  AFTER INSERT OR UPDATE OF rider_rating ON ride_requests
  FOR EACH ROW
  WHEN (NEW.rider_rating IS NOT NULL)
  EXECUTE FUNCTION update_rider_rating();

CREATE TRIGGER update_driver_rating_trigger
  AFTER INSERT OR UPDATE OF driver_rating ON ride_requests
  FOR EACH ROW
  WHEN (NEW.driver_rating IS NOT NULL)
  EXECUTE FUNCTION update_driver_rating();