-- Allow admins to delete any counter offers
CREATE POLICY "Admins can delete any offers"
ON public.counter_offers
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Function to auto-delete smaller offers when user makes a bigger offer
CREATE OR REPLACE FUNCTION public.auto_delete_smaller_offers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete any previous pending offers from the same user on the same trip
  -- that have a smaller amount than the new offer
  DELETE FROM counter_offers
  WHERE ride_request_id = NEW.ride_request_id
    AND by_user_id = NEW.by_user_id
    AND status = 'pending'
    AND amount < NEW.amount
    AND id != NEW.id;
  
  RETURN NEW;
END;
$$;

-- Trigger to run after inserting a new offer
CREATE TRIGGER auto_delete_smaller_offers_trigger
AFTER INSERT ON public.counter_offers
FOR EACH ROW
EXECUTE FUNCTION public.auto_delete_smaller_offers();