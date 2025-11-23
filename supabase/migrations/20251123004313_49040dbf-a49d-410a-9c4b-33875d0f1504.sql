-- Fix security warning: Set search_path on the new cancellation function
CREATE OR REPLACE FUNCTION track_cancellations_with_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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