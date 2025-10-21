-- Update notification links to use chat URLs for messages
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
  
  -- Create notification for recipient with chat link
  IF v_recipient_id IS NOT NULL THEN
    PERFORM public.create_notification(
      v_recipient_id,
      'message',
      'New Message',
      v_sender_name || ' sent you a message about your trip to ' || v_ride_pickup,
      '/chat/' || NEW.ride_request_id,
      NEW.ride_request_id,
      NEW.sender_id
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';