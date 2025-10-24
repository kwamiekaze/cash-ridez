-- Add index on driver_status updated_at for efficient 24-hour queries
CREATE INDEX IF NOT EXISTS idx_driver_status_updated_at ON driver_status(updated_at DESC);

-- Add index on notifications created_at for efficient recent notifications queries
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Add composite index for faster notification debounce checks
CREATE INDEX IF NOT EXISTS idx_notifications_debounce ON notifications(user_id, related_user_id, created_at DESC) 
WHERE type = 'driver_available';