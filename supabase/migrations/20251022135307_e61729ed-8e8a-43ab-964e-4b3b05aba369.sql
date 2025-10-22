-- Fix search_path for the trigger function
DROP TRIGGER IF EXISTS trigger_reject_pending_offers_on_completion ON ride_requests;
DROP FUNCTION IF EXISTS reject_pending_offers_on_completion();

CREATE OR REPLACE FUNCTION reject_pending_offers_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When trip status changes to completed, reject all pending offers
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
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
  EXECUTE FUNCTION reject_pending_offers_on_completion();