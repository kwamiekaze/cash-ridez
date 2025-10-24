-- Performance indexes for faster queries on ride_requests, driver_status, and profiles

-- Index for ride_requests filtering by status and ordering by created_at
-- Used heavily in TripRequestsList, DriverDashboard, RiderDashboard
CREATE INDEX IF NOT EXISTS idx_ride_requests_status_created_at 
ON ride_requests(status, created_at DESC);

-- Index for driver_status filtering by updated_at and state
-- Used in AvailableDriversList to fetch recent available drivers
CREATE INDEX IF NOT EXISTS idx_driver_status_updated_state 
ON driver_status(updated_at DESC, state);

-- Composite index for ride_requests by rider_id with status and created_at
-- Optimizes RiderDashboard queries
CREATE INDEX IF NOT EXISTS idx_ride_requests_rider_status_created 
ON ride_requests(rider_id, status, created_at DESC);

-- Composite index for ride_requests by assigned_driver_id
-- Optimizes DriverDashboard connected/completed queries
CREATE INDEX IF NOT EXISTS idx_ride_requests_driver_status_updated 
ON ride_requests(assigned_driver_id, status, updated_at DESC) 
WHERE assigned_driver_id IS NOT NULL;

-- Note: profiles(id) already has primary key index, no additional index needed