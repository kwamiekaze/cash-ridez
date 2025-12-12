-- One-time backfill: Add 5-star ratings for historical completed trips where only one party rated
-- This is idempotent - running multiple times will have no effect after the first run

-- Step 1: Update trips where rider rated driver but driver didn't rate rider
UPDATE ride_requests
SET rider_rating = 5
WHERE status = 'completed'
  AND driver_rating IS NOT NULL
  AND rider_rating IS NULL;

-- Step 2: Update trips where driver rated rider but rider didn't rate driver  
UPDATE ride_requests
SET driver_rating = 5
WHERE status = 'completed'
  AND rider_rating IS NOT NULL
  AND driver_rating IS NULL;

-- Step 3: Recalculate all rider rating averages
UPDATE profiles p
SET 
  rider_rating_avg = COALESCE(stats.avg_rating, 0),
  rider_rating_count = COALESCE(stats.rating_count, 0)
FROM (
  SELECT 
    rider_id,
    AVG(rider_rating) as avg_rating,
    COUNT(rider_rating) as rating_count
  FROM ride_requests
  WHERE rider_rating IS NOT NULL AND status = 'completed'
  GROUP BY rider_id
) stats
WHERE p.id = stats.rider_id;

-- Step 4: Recalculate all driver rating averages
UPDATE profiles p
SET 
  driver_rating_avg = COALESCE(stats.avg_rating, 0),
  driver_rating_count = COALESCE(stats.rating_count, 0)
FROM (
  SELECT 
    assigned_driver_id,
    AVG(driver_rating) as avg_rating,
    COUNT(driver_rating) as rating_count
  FROM ride_requests
  WHERE driver_rating IS NOT NULL AND status = 'completed' AND assigned_driver_id IS NOT NULL
  GROUP BY assigned_driver_id
) stats
WHERE p.id = stats.assigned_driver_id;