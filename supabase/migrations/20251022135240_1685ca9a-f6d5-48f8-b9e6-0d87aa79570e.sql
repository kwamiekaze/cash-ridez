-- Add column to profiles for notification preferences
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{"all_notifications": false, "new_trips": false, "new_offers": false, "messages": true, "ride_updates": true}'::jsonb;

-- Create trigger to reject pending offers when trip is completed
CREATE OR REPLACE FUNCTION reject_pending_offers_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- When trip status changes to completed, reject all pending offers
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE counter_offers
    SET status = 'rejected'
    WHERE ride_request_id = NEW.id
      AND status = 'pending';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_reject_pending_offers_on_completion
  AFTER UPDATE ON ride_requests
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION reject_pending_offers_on_completion();