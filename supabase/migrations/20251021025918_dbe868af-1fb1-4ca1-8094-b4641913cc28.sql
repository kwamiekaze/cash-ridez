-- Fix notification trigger functions to use fully qualified table names

-- Recreate notify_new_message function with schema-qualified tables
CREATE OR REPLACE FUNCTION public.notify_new_message() RETURNS TRIGGER AS $$
DECLARE
  v_recipient_id UUID;
  v_sender_name TEXT;
  v_ride_pickup TEXT;
BEGIN
  -- Get the recipient (the other participant in the ride)
  SELECT 
    CASE 
      WHEN rider_id = NEW.sender_id THEN assigned_driver_id
      ELSE rider_id
    END,
    pickup_address
  INTO v_recipient_id, v_ride_pickup
  FROM public.ride_requests
  WHERE id = NEW.ride_request_id;
  
  -- Get sender name
  SELECT display_name INTO v_sender_name FROM public.profiles WHERE id = NEW.sender_id;
  
  -- Create notification for recipient
  IF v_recipient_id IS NOT NULL THEN
    PERFORM public.create_notification(
      v_recipient_id,
      'message',
      'New Message',
      v_sender_name || ' sent you a message about your trip to ' || v_ride_pickup,
      '/trip/' || NEW.ride_request_id,
      NEW.ride_request_id,
      NEW.sender_id
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Recreate notify_new_offer function with schema-qualified tables
CREATE OR REPLACE FUNCTION public.notify_new_offer() RETURNS TRIGGER AS $$
DECLARE
  v_rider_id UUID;
  v_driver_name TEXT;
  v_ride_pickup TEXT;
BEGIN
  -- Get rider and ride details
  SELECT rider_id, pickup_address INTO v_rider_id, v_ride_pickup
  FROM public.ride_requests
  WHERE id = NEW.ride_request_id;
  
  -- Get driver name
  SELECT display_name INTO v_driver_name FROM public.profiles WHERE id = NEW.by_user_id;
  
  -- Create notification for rider
  IF v_rider_id IS NOT NULL THEN
    PERFORM public.create_notification(
      v_rider_id,
      'offer',
      'New Offer Received',
      v_driver_name || ' made an offer of $' || NEW.amount || ' for your trip to ' || v_ride_pickup,
      '/trip/' || NEW.ride_request_id,
      NEW.ride_request_id,
      NEW.by_user_id
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Recreate notify_trip_accepted function with schema-qualified tables
CREATE OR REPLACE FUNCTION public.notify_trip_accepted() RETURNS TRIGGER AS $$
DECLARE
  v_driver_name TEXT;
  v_rider_name TEXT;
BEGIN
  -- Only trigger when status changes to 'assigned' and driver is assigned
  IF NEW.status = 'assigned' AND NEW.assigned_driver_id IS NOT NULL AND 
     (OLD.status IS DISTINCT FROM 'assigned' OR OLD.assigned_driver_id IS NULL) THEN
    
    -- Get names
    SELECT display_name INTO v_driver_name FROM public.profiles WHERE id = NEW.assigned_driver_id;
    SELECT display_name INTO v_rider_name FROM public.profiles WHERE id = NEW.rider_id;
    
    -- Notify rider
    PERFORM public.create_notification(
      NEW.rider_id,
      'trip_accepted',
      'Trip Accepted',
      v_driver_name || ' accepted your trip to ' || NEW.dropoff_address,
      '/trip/' || NEW.id,
      NEW.id,
      NEW.assigned_driver_id
    );
    
    -- Notify driver
    PERFORM public.create_notification(
      NEW.assigned_driver_id,
      'trip_assigned',
      'Trip Confirmed',
      'You accepted ' || v_rider_name || '''s trip to ' || NEW.dropoff_address,
      '/trip/' || NEW.id,
      NEW.id,
      NEW.rider_id
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Recreate notify_trip_cancelled function with schema-qualified tables
CREATE OR REPLACE FUNCTION public.notify_trip_cancelled() RETURNS TRIGGER AS $$
DECLARE
  v_other_user_id UUID;
  v_canceller_name TEXT;
BEGIN
  -- Only trigger when status changes to 'cancelled'
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    
    -- Determine who to notify (the other participant)
    IF NEW.cancelled_by = 'rider' THEN
      v_other_user_id := NEW.assigned_driver_id;
    ELSE
      v_other_user_id := NEW.rider_id;
    END IF;
    
    -- Get canceller name
    IF NEW.cancelled_by = 'rider' THEN
      SELECT display_name INTO v_canceller_name FROM public.profiles WHERE id = NEW.rider_id;
    ELSIF NEW.assigned_driver_id IS NOT NULL THEN
      SELECT display_name INTO v_canceller_name FROM public.profiles WHERE id = NEW.assigned_driver_id;
    END IF;
    
    -- Create notification
    IF v_other_user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        v_other_user_id,
        'trip_cancelled',
        'Trip Cancelled',
        'The trip to ' || NEW.dropoff_address || ' has been cancelled by ' || COALESCE(v_canceller_name, 'the other user'),
        '/trip/' || NEW.id,
        NEW.id,
        CASE WHEN NEW.cancelled_by = 'rider' THEN NEW.rider_id ELSE NEW.assigned_driver_id END
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Recreate notify_verification_status function with schema-qualified tables
CREATE OR REPLACE FUNCTION public.notify_verification_status() RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when verification status changes
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    
    IF NEW.verification_status = 'approved' THEN
      PERFORM public.create_notification(
        NEW.id,
        'verification_approved',
        'Account Verified!',
        'Congratulations! Your account has been verified. You can now post and accept trip requests.',
        '/dashboard',
        NULL,
        NULL
      );
    ELSIF NEW.verification_status = 'rejected' THEN
      PERFORM public.create_notification(
        NEW.id,
        'verification_rejected',
        'Verification Update',
        'Your verification submission needs attention. Please check your email for details and resubmit if needed.',
        '/onboarding',
        NULL,
        NULL
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';