-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_notify_new_message ON public.ride_messages;
DROP TRIGGER IF EXISTS trigger_notify_new_offer ON public.counter_offers;
DROP TRIGGER IF EXISTS trigger_notify_trip_accepted ON public.ride_requests;
DROP TRIGGER IF EXISTS trigger_notify_trip_cancelled ON public.ride_requests;
DROP TRIGGER IF EXISTS trigger_notify_verification_status ON public.profiles;

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS public.notify_new_message();
DROP FUNCTION IF EXISTS public.notify_new_offer();
DROP FUNCTION IF EXISTS public.notify_trip_accepted();
DROP FUNCTION IF EXISTS public.notify_trip_cancelled();
DROP FUNCTION IF EXISTS public.notify_verification_status();
DROP FUNCTION IF EXISTS public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID);

-- Drop existing table if exists
DROP TABLE IF EXISTS public.notifications CASCADE;

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  related_ride_id UUID REFERENCES public.ride_requests(id) ON DELETE CASCADE,
  related_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id);

-- System can insert notifications (via triggers/functions)
CREATE POLICY "System can insert notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(read);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Function to create notification
CREATE FUNCTION public.create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_link TEXT DEFAULT NULL,
  p_related_ride_id UUID DEFAULT NULL,
  p_related_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, link, related_ride_id, related_user_id)
  VALUES (p_user_id, p_type, p_title, p_message, p_link, p_related_ride_id, p_related_user_id)
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Notify when new message is sent
CREATE FUNCTION public.notify_new_message() RETURNS TRIGGER AS $$
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
  FROM ride_requests
  WHERE id = NEW.ride_request_id;
  
  -- Get sender name
  SELECT display_name INTO v_sender_name FROM profiles WHERE id = NEW.sender_id;
  
  -- Create notification for recipient
  IF v_recipient_id IS NOT NULL THEN
    PERFORM create_notification(
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_new_message
  AFTER INSERT ON public.ride_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_message();

-- Trigger: Notify when offer is made
CREATE FUNCTION public.notify_new_offer() RETURNS TRIGGER AS $$
DECLARE
  v_rider_id UUID;
  v_driver_name TEXT;
  v_ride_pickup TEXT;
BEGIN
  -- Get rider and ride details
  SELECT rider_id, pickup_address INTO v_rider_id, v_ride_pickup
  FROM ride_requests
  WHERE id = NEW.ride_request_id;
  
  -- Get driver name
  SELECT display_name INTO v_driver_name FROM profiles WHERE id = NEW.by_user_id;
  
  -- Create notification for rider
  IF v_rider_id IS NOT NULL THEN
    PERFORM create_notification(
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_new_offer
  AFTER INSERT ON public.counter_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_offer();

-- Trigger: Notify when trip is accepted
CREATE FUNCTION public.notify_trip_accepted() RETURNS TRIGGER AS $$
DECLARE
  v_driver_name TEXT;
  v_rider_name TEXT;
BEGIN
  -- Only trigger when status changes to 'assigned' and driver is assigned
  IF NEW.status = 'assigned' AND NEW.assigned_driver_id IS NOT NULL AND 
     (OLD.status IS DISTINCT FROM 'assigned' OR OLD.assigned_driver_id IS NULL) THEN
    
    -- Get names
    SELECT display_name INTO v_driver_name FROM profiles WHERE id = NEW.assigned_driver_id;
    SELECT display_name INTO v_rider_name FROM profiles WHERE id = NEW.rider_id;
    
    -- Notify rider
    PERFORM create_notification(
      NEW.rider_id,
      'trip_accepted',
      'Trip Accepted',
      v_driver_name || ' accepted your trip to ' || NEW.dropoff_address,
      '/trip/' || NEW.id,
      NEW.id,
      NEW.assigned_driver_id
    );
    
    -- Notify driver
    PERFORM create_notification(
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_trip_accepted
  AFTER UPDATE ON public.ride_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_trip_accepted();

-- Trigger: Notify when trip is cancelled
CREATE FUNCTION public.notify_trip_cancelled() RETURNS TRIGGER AS $$
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
      SELECT display_name INTO v_canceller_name FROM profiles WHERE id = NEW.rider_id;
    ELSIF NEW.assigned_driver_id IS NOT NULL THEN
      SELECT display_name INTO v_canceller_name FROM profiles WHERE id = NEW.assigned_driver_id;
    END IF;
    
    -- Create notification
    IF v_other_user_id IS NOT NULL THEN
      PERFORM create_notification(
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_trip_cancelled
  AFTER UPDATE ON public.ride_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_trip_cancelled();

-- Trigger: Notify when verification status changes
CREATE FUNCTION public.notify_verification_status() RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when verification status changes
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    
    IF NEW.verification_status = 'approved' THEN
      PERFORM create_notification(
        NEW.id,
        'verification_approved',
        'Account Verified!',
        'Congratulations! Your account has been verified. You can now post and accept trip requests.',
        '/dashboard',
        NULL,
        NULL
      );
    ELSIF NEW.verification_status = 'rejected' THEN
      PERFORM create_notification(
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_verification_status
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_verification_status();