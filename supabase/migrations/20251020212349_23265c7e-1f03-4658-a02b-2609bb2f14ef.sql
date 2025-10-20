-- Fix the eta_minutes constraint to allow 0 or NULL for offer-accepted rides
-- The constraint currently blocks eta_minutes = 0, which is valid when accepting an offer
ALTER TABLE ride_requests DROP CONSTRAINT IF EXISTS eta_minutes_valid;

-- Add a new constraint that allows NULL or values between 0-240
ALTER TABLE ride_requests ADD CONSTRAINT eta_minutes_valid 
  CHECK (eta_minutes IS NULL OR (eta_minutes >= 0 AND eta_minutes <= 240));