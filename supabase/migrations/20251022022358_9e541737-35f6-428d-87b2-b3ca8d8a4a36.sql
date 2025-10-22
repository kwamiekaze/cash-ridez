-- Fix security warnings: Add proper search_path to trigger functions
CREATE OR REPLACE FUNCTION public.update_rider_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Calculate new average and count for rider
  UPDATE profiles
  SET 
    rider_rating_avg = (
      SELECT COALESCE(AVG(rider_rating), 0)
      FROM ride_requests
      WHERE rider_id = NEW.rider_id
        AND rider_rating IS NOT NULL
        AND status = 'completed'
    ),
    rider_rating_count = (
      SELECT COUNT(*)
      FROM ride_requests
      WHERE rider_id = NEW.rider_id
        AND rider_rating IS NOT NULL
        AND status = 'completed'
    )
  WHERE id = NEW.rider_id;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_driver_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Calculate new average and count for driver
  IF NEW.assigned_driver_id IS NOT NULL THEN
    UPDATE profiles
    SET 
      driver_rating_avg = (
        SELECT COALESCE(AVG(driver_rating), 0)
        FROM ride_requests
        WHERE assigned_driver_id = NEW.assigned_driver_id
          AND driver_rating IS NOT NULL
          AND status = 'completed'
      ),
      driver_rating_count = (
        SELECT COUNT(*)
        FROM ride_requests
        WHERE assigned_driver_id = NEW.assigned_driver_id
          AND driver_rating IS NOT NULL
          AND status = 'completed'
      )
    WHERE id = NEW.assigned_driver_id;
  END IF;
  
  RETURN NEW;
END;
$function$;