-- Update accept_ride_atomic function to accept an accepted offer ID parameter
-- This prevents marking the accepted offer as rejected

DROP FUNCTION IF EXISTS public.accept_ride_atomic(uuid, uuid, integer, boolean);

CREATE OR REPLACE FUNCTION public.accept_ride_atomic(
  p_ride_id uuid,
  p_driver_id uuid,
  p_eta_minutes integer,
  p_skip_active_check boolean DEFAULT false,
  p_accepted_offer_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_active_ride uuid;
  v_ride_status ride_status;
BEGIN
  -- Lock the ride request row to prevent concurrent accepts
  SELECT status INTO v_ride_status
  FROM ride_requests
  WHERE id = p_ride_id
  FOR UPDATE;

  -- Check if ride is still open
  IF v_ride_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ride not found');
  END IF;

  IF v_ride_status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ride is no longer available');
  END IF;

  -- Check if driver has an active ride (with lock) - unless skipped
  IF NOT p_skip_active_check THEN
    SELECT active_assigned_ride_id INTO v_driver_active_ride
    FROM profiles
    WHERE id = p_driver_id
    FOR UPDATE;

    IF v_driver_active_ride IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'You already have an active ride. Complete it first.');
    END IF;
  ELSE
    -- Still need to lock the profile row even when skipping check
    PERFORM 1 FROM profiles WHERE id = p_driver_id FOR UPDATE;
  END IF;

  -- Update ride request
  UPDATE ride_requests
  SET 
    status = 'assigned',
    assigned_driver_id = p_driver_id,
    eta_minutes = p_eta_minutes,
    updated_at = now()
  WHERE id = p_ride_id;

  -- Update driver profile
  UPDATE profiles
  SET active_assigned_ride_id = p_ride_id
  WHERE id = p_driver_id;

  -- If an offer was accepted, mark it as accepted
  IF p_accepted_offer_id IS NOT NULL THEN
    UPDATE counter_offers
    SET status = 'accepted'
    WHERE id = p_accepted_offer_id;
  END IF;

  -- Reject all other pending offers for this ride (excluding the accepted one)
  UPDATE counter_offers
  SET status = 'rejected'
  WHERE ride_request_id = p_ride_id 
    AND status = 'pending'
    AND (p_accepted_offer_id IS NULL OR id != p_accepted_offer_id);

  RETURN jsonb_build_object('success', true, 'message', 'Ride accepted successfully');
END;
$$;