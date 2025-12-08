-- Create function to send verification welcome email via Edge Function
CREATE OR REPLACE FUNCTION public.send_verification_welcome_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_first_name TEXT;
  v_response JSONB;
BEGIN
  -- Only trigger when verification_status changes TO 'approved'
  -- and wasn't already 'approved' before
  IF NEW.verification_status = 'approved' 
     AND (OLD.verification_status IS NULL OR OLD.verification_status != 'approved') THEN
    
    -- Extract first name from full_name or fall back to display_name
    v_first_name := COALESCE(
      SPLIT_PART(NEW.full_name, ' ', 1),
      NEW.display_name,
      'there'
    );
    
    -- Log the trigger firing
    RAISE LOG 'Verification welcome email trigger fired for user %, email: %, isDriver: %, isRider: %',
      NEW.id, NEW.email, NEW.is_driver, NEW.is_rider;
    
    -- Call the Edge Function via pg_net (async HTTP call)
    -- Note: We use net.http_post for async, non-blocking calls
    PERFORM net.http_post(
      url := CONCAT(
        current_setting('app.settings.supabase_url', true),
        '/functions/v1/send-verification-welcome-email'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', CONCAT('Bearer ', current_setting('app.settings.service_role_key', true))
      ),
      body := jsonb_build_object(
        'userId', NEW.id::text,
        'userEmail', NEW.email,
        'firstName', v_first_name,
        'isDriver', COALESCE(NEW.is_driver, false),
        'isRider', COALESCE(NEW.is_rider, false)
      )
    );
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on profiles table for verification status changes
DROP TRIGGER IF EXISTS trigger_send_verification_welcome_email ON public.profiles;

CREATE TRIGGER trigger_send_verification_welcome_email
  AFTER UPDATE OF verification_status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.send_verification_welcome_email();

-- Also handle INSERT case (for users created already verified, edge case)
DROP TRIGGER IF EXISTS trigger_send_verification_welcome_email_insert ON public.profiles;

CREATE TRIGGER trigger_send_verification_welcome_email_insert
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  WHEN (NEW.verification_status = 'approved')
  EXECUTE FUNCTION public.send_verification_welcome_email();

-- Add comment for documentation
COMMENT ON FUNCTION public.send_verification_welcome_email() IS 'Trigger function that sends welcome email when user verification_status changes to approved';