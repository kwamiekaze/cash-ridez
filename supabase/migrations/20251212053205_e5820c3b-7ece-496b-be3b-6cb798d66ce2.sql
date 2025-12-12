-- Fix remaining assigned trips where the driver's offer should be accepted
UPDATE counter_offers co
SET status = 'accepted'
FROM ride_requests rr
WHERE co.ride_request_id = rr.id
  AND rr.status = 'assigned'
  AND rr.assigned_driver_id IS NOT NULL
  AND co.by_user_id = rr.assigned_driver_id
  AND co.status != 'accepted';

-- Ensure all other offers on assigned trips are rejected (not the assigned driver's)
UPDATE counter_offers co
SET status = 'rejected'
FROM ride_requests rr
WHERE co.ride_request_id = rr.id
  AND rr.status = 'assigned'
  AND rr.assigned_driver_id IS NOT NULL
  AND co.by_user_id != rr.assigned_driver_id
  AND co.status = 'pending';