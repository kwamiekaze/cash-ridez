-- Fix the trip counter trigger to only increment once per user per trip
-- Drop the problematic trigger and function properly

DROP TRIGGER IF EXISTS increment_completed_trips_trigger ON ride_requests;
DROP FUNCTION IF EXISTS increment_completed_trips_on_action() CASCADE;

-- Update the repair function to properly count actual completed trips
CREATE OR REPLACE FUNCTION public.repair_user_trip_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_record RECORD;
  total_completed INTEGER;
BEGIN
  -- Loop through all users
  FOR user_record IN SELECT id FROM profiles
  LOOP
    -- Count actual completed trips (both as rider and driver)
    SELECT COUNT(DISTINCT rr.id) INTO total_completed
    FROM ride_requests rr
    WHERE (rr.rider_id = user_record.id OR rr.assigned_driver_id = user_record.id)
    AND rr.status = 'completed';
    
    -- Update profile with correct counts
    UPDATE profiles
    SET 
      completed_trips_count = total_completed,
      free_uses_remaining = GREATEST(0, 3 - total_completed)
    WHERE id = user_record.id;
  END LOOP;
END;
$function$;

-- Run the repair function to fix all existing counts
SELECT repair_user_trip_counts();