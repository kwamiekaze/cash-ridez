-- Create function to check and create rating reminders
CREATE OR REPLACE FUNCTION public.check_rating_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_rider_name TEXT;
  v_driver_name TEXT;
BEGIN
  -- Only trigger for completed trips with ratings
  IF NEW.status = 'completed' THEN
    
    -- Get rider and driver names
    SELECT display_name INTO v_rider_name FROM public.profiles WHERE id = NEW.rider_id;
    SELECT display_name INTO v_driver_name FROM public.profiles WHERE id = NEW.assigned_driver_id;
    
    -- If driver rated but rider hasn't, notify rider
    IF NEW.driver_rating IS NOT NULL AND NEW.rider_rating IS NULL THEN
      -- Delete old rating reminder if exists
      DELETE FROM public.notifications 
      WHERE user_id = NEW.rider_id 
        AND related_ride_id = NEW.id 
        AND type = 'rating_reminder';
      
      -- Create new rating reminder
      PERFORM public.create_notification(
        NEW.rider_id,
        'rating_reminder',
        'Please Rate Your Driver',
        v_driver_name || ' has rated you! Please rate them back for the completed trip.',
        '/trip/' || NEW.id,
        NEW.id,
        NEW.assigned_driver_id
      );
    END IF;
    
    -- If rider rated but driver hasn't, notify driver
    IF NEW.rider_rating IS NOT NULL AND NEW.driver_rating IS NULL THEN
      -- Delete old rating reminder if exists
      DELETE FROM public.notifications 
      WHERE user_id = NEW.assigned_driver_id 
        AND related_ride_id = NEW.id 
        AND type = 'rating_reminder';
      
      -- Create new rating reminder
      PERFORM public.create_notification(
        NEW.assigned_driver_id,
        'rating_reminder',
        'Please Rate Your Rider',
        v_rider_name || ' has rated you! Please rate them back for the completed trip.',
        '/trip/' || NEW.id,
        NEW.id,
        NEW.rider_id
      );
    END IF;
    
    -- If both rated, delete any rating reminders
    IF NEW.rider_rating IS NOT NULL AND NEW.driver_rating IS NOT NULL THEN
      DELETE FROM public.notifications 
      WHERE related_ride_id = NEW.id 
        AND type = 'rating_reminder';
    END IF;
    
    -- Check for completion reminders
    -- If driver completed but rider hasn't
    IF NEW.driver_completed = true AND NEW.rider_completed = false THEN
      -- Delete old completion reminder if exists
      DELETE FROM public.notifications 
      WHERE user_id = NEW.rider_id 
        AND related_ride_id = NEW.id 
        AND type = 'completion_reminder';
      
      -- Create completion reminder
      PERFORM public.create_notification(
        NEW.rider_id,
        'completion_reminder',
        'Please Mark Trip as Complete',
        v_driver_name || ' has marked the trip as complete. Please confirm completion.',
        '/trip/' || NEW.id,
        NEW.id,
        NEW.assigned_driver_id
      );
    END IF;
    
    -- If rider completed but driver hasn't
    IF NEW.rider_completed = true AND NEW.driver_completed = false THEN
      -- Delete old completion reminder if exists
      DELETE FROM public.notifications 
      WHERE user_id = NEW.assigned_driver_id 
        AND related_ride_id = NEW.id 
        AND type = 'completion_reminder';
      
      -- Create completion reminder
      PERFORM public.create_notification(
        NEW.assigned_driver_id,
        'completion_reminder',
        'Please Mark Trip as Complete',
        v_rider_name || ' has marked the trip as complete. Please confirm completion.',
        '/trip/' || NEW.id,
        NEW.id,
        NEW.rider_id
      );
    END IF;
    
    -- If both completed, delete completion reminders
    IF NEW.rider_completed = true AND NEW.driver_completed = true THEN
      DELETE FROM public.notifications 
      WHERE related_ride_id = NEW.id 
        AND type = 'completion_reminder';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for rating and completion reminders
DROP TRIGGER IF EXISTS trigger_rating_completion_reminders ON public.ride_requests;
CREATE TRIGGER trigger_rating_completion_reminders
AFTER UPDATE ON public.ride_requests
FOR EACH ROW
EXECUTE FUNCTION public.check_rating_reminders();

-- Create function to notify on status changes
CREATE OR REPLACE FUNCTION public.notify_trip_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_rider_name TEXT;
  v_driver_name TEXT;
BEGIN
  -- Only trigger when status changes
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    
    -- Get names
    SELECT display_name INTO v_rider_name FROM public.profiles WHERE id = NEW.rider_id;
    IF NEW.assigned_driver_id IS NOT NULL THEN
      SELECT display_name INTO v_driver_name FROM public.profiles WHERE id = NEW.assigned_driver_id;
    END IF;
    
    -- Status changed from open to assigned (already handled by notify_trip_accepted)
    -- Status changed to completed
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
      -- Notify both parties
      IF NEW.assigned_driver_id IS NOT NULL THEN
        PERFORM public.create_notification(
          NEW.rider_id,
          'trip_completed',
          'Trip Completed',
          'Your trip with ' || v_driver_name || ' has been marked as completed.',
          '/trip/' || NEW.id,
          NEW.id,
          NEW.assigned_driver_id
        );
        
        PERFORM public.create_notification(
          NEW.assigned_driver_id,
          'trip_completed',
          'Trip Completed',
          'Your trip with ' || v_rider_name || ' has been marked as completed.',
          '/trip/' || NEW.id,
          NEW.id,
          NEW.rider_id
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for status change notifications
DROP TRIGGER IF EXISTS trigger_trip_status_change ON public.ride_requests;
CREATE TRIGGER trigger_trip_status_change
AFTER UPDATE ON public.ride_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_trip_status_change();