ALTER TABLE public.verification_email_queue
  ADD COLUMN IF NOT EXISTS decision TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP WITH TIME ZONE;

DO $$ BEGIN
  ALTER TABLE public.verification_email_queue
    ADD CONSTRAINT verification_email_queue_decision_check
    CHECK (decision IN ('approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- one pending row per user per decision kind (allows a later re-decision)
DROP INDEX IF EXISTS public.idx_verification_email_queue_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_email_queue_pending
  ON public.verification_email_queue (user_id, decision)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_verification_email_queue_ready
  ON public.verification_email_queue (status, next_attempt_at);

CREATE OR REPLACE FUNCTION public.queue_verification_welcome_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_first_name TEXT;
  v_decision TEXT;
BEGIN
  IF NEW.verification_status IS DISTINCT FROM 'approved'
     AND NEW.verification_status IS DISTINCT FROM 'rejected' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.verification_status IS NOT DISTINCT FROM NEW.verification_status THEN
    RETURN NEW;
  END IF;

  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  v_decision := NEW.verification_status;

  v_first_name := COALESCE(
    NULLIF(SPLIT_PART(COALESCE(NEW.full_name, ''), ' ', 1), ''),
    NEW.display_name,
    'there'
  );

  INSERT INTO public.verification_email_queue (
    user_id, user_email, first_name, is_driver, is_rider, decision, rejection_reason
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_first_name,
    COALESCE(NEW.is_driver, false),
    COALESCE(NEW.is_rider, false),
    v_decision,
    CASE WHEN v_decision = 'rejected' THEN NEW.verification_notes ELSE NULL END
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_queue_verification_welcome_email ON public.profiles;
CREATE TRIGGER trigger_queue_verification_welcome_email
  AFTER UPDATE OF verification_status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_verification_welcome_email();

DROP TRIGGER IF EXISTS trigger_queue_verification_welcome_email_insert ON public.profiles;
CREATE TRIGGER trigger_queue_verification_welcome_email_insert
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  WHEN (NEW.verification_status IN ('approved','rejected'))
  EXECUTE FUNCTION public.queue_verification_welcome_email();

-- Lock down access: no anon, admins read/manage, service_role unrestricted.
DROP POLICY IF EXISTS "System can manage email queue" ON public.verification_email_queue;

CREATE POLICY "Admins can view verification email queue"
ON public.verification_email_queue
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update verification email queue"
ON public.verification_email_queue
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.verification_email_queue FROM PUBLIC;
REVOKE ALL ON public.verification_email_queue FROM anon;
GRANT SELECT, UPDATE ON public.verification_email_queue TO authenticated;
GRANT ALL ON public.verification_email_queue TO service_role;