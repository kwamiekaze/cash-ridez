-- Add approx_geo column to driver_status for privacy-safe approximate locations
ALTER TABLE driver_status 
ADD COLUMN IF NOT EXISTS approx_geo jsonb DEFAULT NULL;

COMMENT ON COLUMN driver_status.approx_geo IS 'Privacy-safe approximate location derived from current_zip + jitter. Format: {"lat": number, "lng": number}. Never stores exact GPS.';

-- Update the notify_nearby_riders_of_driver function to handle approx_geo
CREATE OR REPLACE FUNCTION public.notify_nearby_riders_of_driver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  driver_profile RECORD;
  rider_record RECORD;
  notification_sent_recently BOOLEAN;
  scf_prefix TEXT;
BEGIN
  -- Only proceed if driver is becoming available or changing ZIP/location while available
  IF NEW.state = 'available' AND NEW.current_zip IS NOT NULL AND (
    OLD IS NULL OR 
    OLD.state != 'available' OR 
    OLD.current_zip IS NULL OR
    OLD.current_zip != NEW.current_zip OR
    OLD.approx_geo IS DISTINCT FROM NEW.approx_geo
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
          NEW.user_id,
          '/rider?tab=map',
          false,
          NOW()
        );
      END IF;
      
    END LOOP;
    
  END IF;
  
  RETURN NEW;
END;
$function$;