-- One-time backfill: Fix offer statuses for completed trips
-- For completed trips, the assigned driver's offer should be 'accepted', not 'rejected'

-- Step 1: Update the assigned driver's offer to 'accepted' for all completed trips
UPDATE counter_offers co
SET status = 'accepted'
FROM ride_requests rr
WHERE co.ride_request_id = rr.id
  AND rr.status = 'completed'
  AND rr.assigned_driver_id IS NOT NULL
  AND co.by_user_id = rr.assigned_driver_id
  AND co.status != 'accepted';

-- Step 2: Ensure all other offers on completed trips are marked as 'rejected'
-- (for drivers who were NOT assigned to the trip)
UPDATE counter_offers co
SET status = 'rejected'
FROM ride_requests rr
WHERE co.ride_request_id = rr.id
  AND rr.status = 'completed'
  AND rr.assigned_driver_id IS NOT NULL
  AND co.by_user_id != rr.assigned_driver_id
  AND co.status = 'pending';