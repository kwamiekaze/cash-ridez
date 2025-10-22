-- Update notification trigger to use nearby ZIP matching and include driver identity
-- Drop trigger and function with CASCADE to handle dependencies
DROP TRIGGER IF EXISTS notify_riders_driver_available ON driver_status CASCADE;
DROP TRIGGER IF EXISTS trigger_notify_nearby_riders ON driver_status CASCADE;
DROP FUNCTION IF EXISTS notify_nearby_riders_of_driver() CASCADE;

-- Create enhanced notification function with nearby ZIP matching
CREATE OR REPLACE FUNCTION notify_nearby_riders_of_driver()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  driver_profile RECORD;
  rider_record RECORD;
  notification_sent_recently BOOLEAN;
  scf_prefix TEXT;
BEGIN
  -- Only proceed if driver is becoming available or changing ZIP while available
  IF NEW.state = 'available' AND NEW.current_zip IS NOT NULL AND (
    OLD IS NULL OR 
    OLD.state != 'available' OR 
    OLD.current_zip IS NULL OR
    OLD.current_zip != NEW.current_zip
  ) THEN
    
    -- Get driver profile with full name and photo
    SELECT id, full_name, display_name, photo_url
    INTO driver_profile
    FROM profiles
    WHERE id = NEW.user_id;
    
    -- Get SCF prefix (first 3 digits) for fast matching
    scf_prefix := LEFT(NEW.current_zip, 3);
    
    -- Find riders who:
    -- 1. Have notification enabled
    -- 2. Have a profile_zip set
    -- 3. Are in nearby ZIP (same SCF prefix for simplicity in SQL)
    FOR rider_record IN
      SELECT id, profile_zip, display_name
      FROM profiles
      WHERE notify_new_driver = true
        AND profile_zip IS NOT NULL
        AND (
          -- Same ZIP
          profile_zip = NEW.current_zip
          OR
          -- Same SCF (first 3 digits match) for regional proximity
          LEFT(profile_zip, 3) = scf_prefix
        )
        AND id != NEW.user_id -- Don't notify the driver themselves
    LOOP
      
      -- Check if we've sent a notification for this driver to this rider recently (30 min debounce)
      SELECT EXISTS(
        SELECT 1 FROM notifications
        WHERE user_id = rider_record.id
          AND related_user_id = NEW.user_id
          AND type = 'driver_available'
          AND created_at > NOW() - INTERVAL '30 minutes'
      ) INTO notification_sent_recently;
      
      -- Only send if not sent recently
      IF NOT notification_sent_recently THEN
        INSERT INTO notifications (
          user_id,
          type,
          title,
          message,
          related_user_id,
          link,
          read,
          created_at
        ) VALUES (
          rider_record.id,
          'driver_available',
          'Driver Available Near You',
          COALESCE(driver_profile.full_name, driver_profile.display_name, 'A driver') || 
            ' is now available near you (ZIP ' || NEW.current_zip || ').',
          NEW.user_id, -- Link to the driver's profile
          '/profile?user=' || NEW.user_id,
          false,
          NOW()
        );
      END IF;
      
    END LOOP;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER notify_riders_driver_available
AFTER INSERT OR UPDATE ON driver_status
FOR EACH ROW
EXECUTE FUNCTION notify_nearby_riders_of_driver();

-- Add index for faster nearby ZIP lookups
CREATE INDEX IF NOT EXISTS idx_profiles_notify_zip_prefix 
ON profiles (LEFT(profile_zip, 3)) 
WHERE notify_new_driver = true AND profile_zip IS NOT NULL;