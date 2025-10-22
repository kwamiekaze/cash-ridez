-- Manually recalculate all user ratings to fix aggregation
UPDATE profiles
SET 
  rider_rating_avg = COALESCE((
    SELECT AVG(rider_rating)
    FROM ride_requests
    WHERE rider_id = profiles.id
      AND rider_rating IS NOT NULL
      AND status = 'completed'
  ), 0),
  rider_rating_count = COALESCE((
    SELECT COUNT(*)
    FROM ride_requests
    WHERE rider_id = profiles.id
      AND rider_rating IS NOT NULL
      AND status = 'completed'
  ), 0),
  driver_rating_avg = COALESCE((
    SELECT AVG(driver_rating)
    FROM ride_requests
    WHERE assigned_driver_id = profiles.id
      AND driver_rating IS NOT NULL
      AND status = 'completed'
  ), 0),
  driver_rating_count = COALESCE((
    SELECT COUNT(*)
    FROM ride_requests
    WHERE assigned_driver_id = profiles.id
      AND driver_rating IS NOT NULL
      AND status = 'completed'
  ), 0)
WHERE id IN (
  SELECT DISTINCT rider_id FROM ride_requests WHERE rider_rating IS NOT NULL
  UNION
  SELECT DISTINCT assigned_driver_id FROM ride_requests WHERE driver_rating IS NOT NULL
);