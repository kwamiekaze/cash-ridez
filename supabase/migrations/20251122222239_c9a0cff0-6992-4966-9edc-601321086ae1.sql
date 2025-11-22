-- Fix the increment_completed_trips_on_action trigger to properly track completions
-- Drop existing trigger and function
DROP TRIGGER IF EXISTS track_completed_trips_trigger ON ride_requests;
DROP FUNCTION IF EXISTS increment_completed_trips_on_action();

-- Create improved function that properly increments on first completion action
CREATE OR REPLACE FUNCTION increment_completed_trips_on_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When a rider rates (first action if they haven't marked complete)
  IF NEW.rider_rating IS NOT NULL AND (OLD.rider_rating IS NULL OR OLD IS NULL) AND (OLD.rider_completed IS NULL OR OLD.rider_completed = false) THEN
    UPDATE profiles 
    SET completed_trips_count = completed_trips_count + 1
    WHERE id = NEW.rider_id;
  END IF;
  
  -- When a driver rates (first action if they haven't marked complete)
  IF NEW.driver_rating IS NOT NULL AND (OLD.driver_rating IS NULL OR OLD IS NULL) AND NEW.assigned_driver_id IS NOT NULL AND (OLD.driver_completed IS NULL OR OLD.driver_completed = false) THEN
    UPDATE profiles 
    SET completed_trips_count = completed_trips_count + 1
    WHERE id = NEW.assigned_driver_id;
  END IF;
  
  -- When rider marks complete (first action if they haven't rated)
  IF NEW.rider_completed = true AND (OLD.rider_completed IS NULL OR OLD.rider_completed = false OR OLD IS NULL) AND (OLD.rider_rating IS NULL OR NEW.rider_rating IS NULL) THEN
    UPDATE profiles 
    SET completed_trips_count = completed_trips_count + 1
    WHERE id = NEW.rider_id;
  END IF;
  
  -- When driver marks complete (first action if they haven't rated)
  IF NEW.driver_completed = true AND (OLD.driver_completed IS NULL OR OLD.driver_completed = false OR OLD IS NULL) AND NEW.assigned_driver_id IS NOT NULL AND (OLD.driver_rating IS NULL OR NEW.driver_rating IS NULL) THEN
    UPDATE profiles 
    SET completed_trips_count = completed_trips_count + 1
    WHERE id = NEW.assigned_driver_id;
  END IF;
  
  -- Set trip status to 'completed' when EITHER party marks complete OR rates
  IF (NEW.rider_rating IS NOT NULL AND (OLD.rider_rating IS NULL OR OLD IS NULL)) OR 
     (NEW.driver_rating IS NOT NULL AND (OLD.driver_rating IS NULL OR OLD IS NULL)) OR
     (NEW.rider_completed = true AND (OLD.rider_completed IS NULL OR OLD.rider_completed = false OR OLD IS NULL)) OR
     (NEW.driver_completed = true AND (OLD.driver_completed IS NULL OR OLD.driver_completed = false OR OLD IS NULL)) THEN
    NEW.status = 'completed';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER track_completed_trips_trigger
BEFORE UPDATE ON ride_requests
FOR EACH ROW
EXECUTE FUNCTION increment_completed_trips_on_action();

-- Create a repair function to recalculate all user stats based on actual trip data
CREATE OR REPLACE FUNCTION repair_user_trip_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_record RECORD;
  rider_completed_count INTEGER;
  driver_completed_count INTEGER;
  total_completed INTEGER;
BEGIN
  -- Loop through all users
  FOR user_record IN SELECT id FROM profiles
  LOOP
    -- Count completed trips as rider
    SELECT COUNT(*) INTO rider_completed_count
    FROM ride_requests
    WHERE rider_id = user_record.id
    AND status = 'completed';
    
    -- Count completed trips as driver
    SELECT COUNT(*) INTO driver_completed_count
    FROM ride_requests
    WHERE assigned_driver_id = user_record.id
    AND status = 'completed';
    
    -- Total completed trips
    total_completed := rider_completed_count + driver_completed_count;
    
    -- Update profile with correct counts
    UPDATE profiles
    SET 
      completed_trips_count = total_completed,
      free_uses_remaining = GREATEST(0, 3 - total_completed)
    WHERE id = user_record.id;
  END LOOP;
END;
$$;

-- Execute the repair function to fix all existing user data
SELECT repair_user_trip_counts();