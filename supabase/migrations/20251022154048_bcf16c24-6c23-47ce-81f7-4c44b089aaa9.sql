-- Function to notify admins when a new user signs up
CREATE OR REPLACE FUNCTION public.notify_admins_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  -- Notify all admins about the new user
  FOR v_admin_id IN 
    SELECT user_id FROM user_roles WHERE role = 'admin'
  LOOP
    PERFORM create_notification(
      v_admin_id,
      'new_user',
      'New User Registered',
      'A new user has registered: ' || COALESCE(NEW.email, 'Unknown email'),
      '/admin?tab=users',
      NULL,
      NEW.id
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Trigger to notify admins on new user creation
CREATE TRIGGER trigger_notify_admins_new_user
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_new_user();

-- Function to notify admins when a user submits ID for verification
CREATE OR REPLACE FUNCTION public.notify_admins_kyc_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id UUID;
  v_user_email TEXT;
BEGIN
  -- Get the user's email
  SELECT email INTO v_user_email FROM profiles WHERE id = NEW.user_id;
  
  -- Notify all admins about the new KYC submission
  FOR v_admin_id IN 
    SELECT user_id FROM user_roles WHERE role = 'admin'
  LOOP
    PERFORM create_notification(
      v_admin_id,
      'kyc_submission',
      'New ID Verification Submitted',
      COALESCE(v_user_email, 'A user') || ' has submitted ID verification for review (' || NEW.role || ' role)',
      '/admin?tab=verification',
      NULL,
      NEW.user_id
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Trigger to notify admins on KYC submission
CREATE TRIGGER trigger_notify_admins_kyc_submission
  AFTER INSERT ON public.kyc_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_kyc_submission();