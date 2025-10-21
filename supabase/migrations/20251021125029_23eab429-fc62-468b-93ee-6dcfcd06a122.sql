-- Update notify_verification_status function to include rejection reason
CREATE OR REPLACE FUNCTION public.notify_verification_status() RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when verification status changes
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    
    IF NEW.verification_status = 'approved' THEN
      PERFORM public.create_notification(
        NEW.id,
        'verification_approved',
        'Account Verified!',
        'Congratulations! Your account has been verified. You can now post and accept trip requests.',
        '/dashboard',
        NULL,
        NULL
      );
    ELSIF NEW.verification_status = 'rejected' THEN
      PERFORM public.create_notification(
        NEW.id,
        'verification_rejected',
        'Verification Update',
        CASE 
          WHEN NEW.verification_notes IS NOT NULL AND NEW.verification_notes != '' THEN
            'Your verification was not approved. Reason: ' || NEW.verification_notes || ' Please resubmit with the correct documentation.'
          ELSE
            'Your verification submission needs attention. Please check your email for details and resubmit if needed.'
        END,
        '/onboarding',
        NULL,
        NULL
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';