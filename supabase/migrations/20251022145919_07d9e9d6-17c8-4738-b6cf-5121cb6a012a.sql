-- Create driver_status table for availability tracking
CREATE TABLE IF NOT EXISTS public.driver_status (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'unavailable' CHECK (state IN ('available', 'on_trip', 'busy', 'unavailable')),
  current_zip text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_status ENABLE ROW LEVEL SECURITY;

-- Drivers can update their own status
CREATE POLICY "Drivers can update own status"
ON public.driver_status
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Verified users can view driver status
CREATE POLICY "Verified users can view driver status"
ON public.driver_status
FOR SELECT
TO authenticated
USING (is_verified_user(auth.uid()));

-- Add notification preference for new nearby drivers
-- (notification_preferences already exists in profiles as jsonb)

-- Create kyc_submissions table for ID verification tracking
CREATE TABLE IF NOT EXISTS public.kyc_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  role text NOT NULL CHECK (role IN ('rider', 'driver')),
  front_image_url text,
  back_image_url text,
  selfie_image_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'failed')),
  notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewer_id uuid REFERENCES auth.users(id)
);

ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;

-- Users can view their own submissions
CREATE POLICY "Users can view own submissions"
ON public.kyc_submissions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can create their own submissions
CREATE POLICY "Users can create submissions"
ON public.kyc_submissions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Admins can view all submissions
CREATE POLICY "Admins can view all submissions"
ON public.kyc_submissions
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update submissions
CREATE POLICY "Admins can update submissions"
ON public.kyc_submissions
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add role_set_at to profiles if not exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_set_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_zip text;

-- Update cancellation logic to check for offers
-- Recreate is_cancel_chargeable function with offer check
CREATE OR REPLACE FUNCTION public.is_cancel_chargeable(
  p_trip_id uuid,
  p_cancelled_by text,
  p_reason_code cancel_reason_code,
  p_accepted_at timestamptz,
  p_pickup_time timestamptz,
  p_cancelled_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_grace_minutes INT := 2;
  v_minutes_since_accept NUMERIC;
  v_offers_count INT;
  v_has_accepted_driver BOOLEAN;
BEGIN
  -- Check if rider cancelled with no offers and no accepted driver
  IF p_cancelled_by = 'rider' THEN
    SELECT COUNT(*), EXISTS(SELECT 1 FROM ride_requests WHERE id = p_trip_id AND assigned_driver_id IS NOT NULL)
    INTO v_offers_count, v_has_accepted_driver
    FROM counter_offers
    WHERE ride_request_id = p_trip_id;
    
    -- If no offers and no accepted driver, don't charge
    IF v_offers_count = 0 AND NOT v_has_accepted_driver THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Original logic
  IF p_reason_code IS NULL THEN
    RETURN true;
  END IF;
  
  IF p_reason_code = 'system_timeout' THEN
    RETURN false;
  END IF;
  
  IF p_reason_code IN ('safety', 'weather') THEN
    RETURN false;
  END IF;
  
  IF p_reason_code = 'duplicate_request' AND p_cancelled_by = 'rider' THEN
    RETURN false;
  END IF;
  
  IF p_accepted_at IS NOT NULL THEN
    v_minutes_since_accept := EXTRACT(EPOCH FROM (p_cancelled_at - p_accepted_at)) / 60;
    IF v_minutes_since_accept <= v_grace_minutes THEN
      RETURN false;
    END IF;
  END IF;
  
  RETURN true;
END;
$$;

-- Create index for faster driver availability queries
CREATE INDEX IF NOT EXISTS idx_driver_status_state_zip ON public.driver_status(state, current_zip) WHERE state = 'available';

-- Create index for kyc submissions
CREATE INDEX IF NOT EXISTS idx_kyc_submissions_user_email ON public.kyc_submissions(user_email);
CREATE INDEX IF NOT EXISTS idx_kyc_submissions_status ON public.kyc_submissions(status);

-- Function to notify riders of new nearby drivers
CREATE OR REPLACE FUNCTION public.notify_nearby_riders_of_driver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_driver_name text;
  v_rider record;
BEGIN
  -- Only trigger when driver becomes available
  IF NEW.state = 'available' AND (OLD.state IS NULL OR OLD.state != 'available') AND NEW.current_zip IS NOT NULL THEN
    
    -- Get driver name
    SELECT display_name INTO v_driver_name FROM profiles WHERE id = NEW.user_id;
    
    -- Find riders in same zip who want notifications
    FOR v_rider IN 
      SELECT id, display_name
      FROM profiles
      WHERE profile_zip = NEW.current_zip
        AND id != NEW.user_id
        AND is_rider = true
        AND notification_preferences->>'notify_new_driver' = 'true'
    LOOP
      -- Create notification
      PERFORM create_notification(
        v_rider.id,
        'driver_available',
        'Driver Available Near You',
        'A driver is now available near you (ZIP ' || NEW.current_zip || ').',
        '/rider?tab=drivers',
        NULL,
        NEW.user_id
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for driver availability notifications
DROP TRIGGER IF EXISTS trigger_notify_nearby_riders ON public.driver_status;
CREATE TRIGGER trigger_notify_nearby_riders
AFTER INSERT OR UPDATE ON public.driver_status
FOR EACH ROW
EXECUTE FUNCTION notify_nearby_riders_of_driver();