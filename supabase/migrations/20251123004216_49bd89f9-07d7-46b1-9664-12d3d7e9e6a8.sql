-- ============================================
-- FIX 1: ATTACH RATING UPDATE TRIGGERS
-- ============================================

-- Drop existing triggers if they exist (to ensure clean state)
DROP TRIGGER IF EXISTS update_rider_rating_trigger ON ride_requests;
DROP TRIGGER IF EXISTS update_driver_rating_trigger ON ride_requests;

-- Create trigger for rider rating updates
CREATE TRIGGER update_rider_rating_trigger
  AFTER UPDATE OF rider_rating ON ride_requests
  FOR EACH ROW
  WHEN (NEW.rider_rating IS NOT NULL AND OLD.rider_rating IS DISTINCT FROM NEW.rider_rating)
  EXECUTE FUNCTION update_rider_rating();

-- Create trigger for driver rating updates  
CREATE TRIGGER update_driver_rating_trigger
  AFTER UPDATE OF driver_rating ON ride_requests
  FOR EACH ROW
  WHEN (NEW.driver_rating IS NOT NULL AND OLD.driver_rating IS DISTINCT FROM NEW.driver_rating)
  EXECUTE FUNCTION update_driver_rating();

-- ============================================
-- FIX 2: ADD CANCEL_COUNT COLUMN TO PROFILES
-- ============================================

-- Add cancel_count column if it doesn't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS cancel_count INTEGER DEFAULT 0 NOT NULL;

-- ============================================
-- FIX 3: UPDATE CANCELLATION TRIGGER TO INCREMENT CANCEL_COUNT
-- ============================================

-- Drop and recreate the cancellation tracking trigger
DROP TRIGGER IF EXISTS track_cancellations_trigger ON ride_requests;

CREATE OR REPLACE FUNCTION track_cancellations_with_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status != 'cancelled') THEN
    -- Increment consecutive cancellations AND cancel_count for the cancelling user
    IF NEW.cancelled_by = 'rider' THEN
      UPDATE profiles 
      SET 
        consecutive_cancellations = consecutive_cancellations + 1,
        cancel_count = cancel_count + 1
      WHERE id = NEW.rider_id;
    ELSIF NEW.cancelled_by = 'driver' THEN
      UPDATE profiles 
      SET 
        consecutive_cancellations = consecutive_cancellations + 1,
        cancel_count = cancel_count + 1
      WHERE id = NEW.assigned_driver_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Attach the new cancellation trigger
CREATE TRIGGER track_cancellations_trigger
  AFTER UPDATE OF status ON ride_requests
  FOR EACH ROW
  EXECUTE FUNCTION track_cancellations_with_count();

-- ============================================
-- FIX 4: ENSURE RLS ALLOWS TRIGGER UPDATES
-- ============================================

-- The SECURITY DEFINER on the functions already allows the triggers
-- to bypass RLS, but let's verify the profiles table allows updates

-- No need to modify RLS since SECURITY DEFINER functions bypass RLS

-- ============================================
-- VERIFICATION: Update any existing data
-- ============================================

-- Recalculate all rider ratings for existing data
UPDATE profiles p
SET 
  rider_rating_avg = COALESCE((
    SELECT AVG(rider_rating)
    FROM ride_requests
    WHERE rider_id = p.id
      AND rider_rating IS NOT NULL
      AND status = 'completed'
  ), 0),
  rider_rating_count = COALESCE((
    SELECT COUNT(*)
    FROM ride_requests
    WHERE rider_id = p.id
      AND rider_rating IS NOT NULL
      AND status = 'completed'
  ), 0)
WHERE EXISTS (
  SELECT 1 FROM ride_requests 
  WHERE rider_id = p.id 
    AND rider_rating IS NOT NULL
    AND status = 'completed'
);

-- Recalculate all driver ratings for existing data
UPDATE profiles p
SET 
  driver_rating_avg = COALESCE((
    SELECT AVG(driver_rating)
    FROM ride_requests
    WHERE assigned_driver_id = p.id
      AND driver_rating IS NOT NULL
      AND status = 'completed'
  ), 0),
  driver_rating_count = COALESCE((
    SELECT COUNT(*)
    FROM ride_requests
    WHERE assigned_driver_id = p.id
      AND driver_rating IS NOT NULL
      AND status = 'completed'
  ), 0)
WHERE EXISTS (
  SELECT 1 FROM ride_requests 
  WHERE assigned_driver_id = p.id 
    AND driver_rating IS NOT NULL
    AND status = 'completed'
);