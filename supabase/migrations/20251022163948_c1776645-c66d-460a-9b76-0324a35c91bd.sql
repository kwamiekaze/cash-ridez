-- Add ZIP-related fields to profiles for riders
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS profile_zip text,
ADD COLUMN IF NOT EXISTS profile_zip_updated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS notify_new_driver boolean DEFAULT false;

-- Create index for faster ZIP lookups
CREATE INDEX IF NOT EXISTS idx_profiles_profile_zip ON public.profiles(profile_zip) WHERE profile_zip IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_driver_status_zip_state ON public.driver_status(current_zip, state) WHERE state = 'available';

-- Function to normalize ZIP codes (strip +4 if present)
CREATE OR REPLACE FUNCTION normalize_zip(zip_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF zip_input IS NULL THEN
    RETURN NULL;
  END IF;
  -- Extract first 5 digits
  RETURN substring(regexp_replace(zip_input, '[^0-9]', '', 'g') from 1 for 5);
END;
$$;

-- Function to validate ZIP codes (5 digits only)
CREATE OR REPLACE FUNCTION is_valid_zip(zip_input text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF zip_input IS NULL THEN
    RETURN false;
  END IF;
  RETURN zip_input ~ '^[0-9]{5}$';
END;
$$;

-- Trigger function to notify riders when a driver becomes available in their ZIP
CREATE OR REPLACE FUNCTION public.notify_nearby_riders_of_driver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_driver_name text;
  v_rider record;
  v_last_notification timestamp with time zone;
BEGIN
  -- Only trigger when driver becomes available with a ZIP
  IF NEW.state = 'available' 
     AND NEW.current_zip IS NOT NULL 
     AND (OLD.state IS NULL OR OLD.state != 'available' OR OLD.current_zip IS DISTINCT FROM NEW.current_zip) 
  THEN
    
    -- Get driver name
    SELECT display_name INTO v_driver_name FROM profiles WHERE id = NEW.user_id;
    
    -- Find riders in same ZIP who want notifications
    FOR v_rider IN 
      SELECT id, display_name
      FROM profiles
      WHERE profile_zip = NEW.current_zip
        AND id != NEW.user_id
        AND notify_new_driver = true
    LOOP
      -- Check if we've sent a notification to this rider for this ZIP in the last 30 minutes
      SELECT MAX(created_at) INTO v_last_notification
      FROM notifications
      WHERE user_id = v_rider.id
        AND type = 'driver_available'
        AND message LIKE '%ZIP ' || NEW.current_zip || '%'
        AND created_at > NOW() - INTERVAL '30 minutes';
      
      -- Only send if no recent notification
      IF v_last_notification IS NULL THEN
        -- Create notification
        PERFORM create_notification(
          v_rider.id,
          'driver_available',
          'Driver Available Near You',
          'A driver is now available in your area (ZIP ' || NEW.current_zip || ').',
          '/rider?tab=drivers',
          NULL,
          NEW.user_id
        );
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop old trigger if exists and create new one
DROP TRIGGER IF EXISTS notify_riders_driver_available ON public.driver_status;
CREATE TRIGGER notify_riders_driver_available
  AFTER INSERT OR UPDATE ON public.driver_status
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_nearby_riders_of_driver();