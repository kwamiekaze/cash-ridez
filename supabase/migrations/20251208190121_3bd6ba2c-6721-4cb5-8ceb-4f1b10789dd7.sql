-- Drop the pg_net based trigger as it may not work on all Supabase environments
DROP TRIGGER IF EXISTS trigger_send_verification_welcome_email ON public.profiles;
DROP TRIGGER IF EXISTS trigger_send_verification_welcome_email_insert ON public.profiles;
DROP FUNCTION IF EXISTS public.send_verification_welcome_email();

-- Instead, we'll modify the existing notify_verification_status function to also handle welcome emails
-- by inserting a record into a queue table that the edge function can poll, OR
-- we rely on the edge function being called directly from frontend when status changes

-- Create a simpler approach: a table to queue welcome emails that can be processed
CREATE TABLE IF NOT EXISTS public.verification_email_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  first_name TEXT,
  is_driver BOOLEAN DEFAULT false,
  is_rider BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.verification_email_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "System can manage email queue"
ON public.verification_email_queue
FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger function that queues emails
CREATE OR REPLACE FUNCTION public.queue_verification_welcome_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_first_name TEXT;
BEGIN
  -- Only trigger when verification_status changes TO 'approved'
  -- and wasn't already 'approved' before
  IF NEW.verification_status = 'approved' 
     AND (OLD.verification_status IS NULL OR OLD.verification_status != 'approved') THEN
    
    -- Extract first name from full_name or fall back to display_name
    v_first_name := COALESCE(
      NULLIF(SPLIT_PART(COALESCE(NEW.full_name, ''), ' ', 1), ''),
      NEW.display_name,
      'there'
    );
    
    -- Insert into queue (will be processed by edge function)
    INSERT INTO verification_email_queue (user_id, user_email, first_name, is_driver, is_rider)
    VALUES (NEW.id, NEW.email, v_first_name, COALESCE(NEW.is_driver, false), COALESCE(NEW.is_rider, false))
    ON CONFLICT DO NOTHING;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on profiles table for verification status changes
CREATE TRIGGER trigger_queue_verification_welcome_email
  AFTER UPDATE OF verification_status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_verification_welcome_email();

-- Also handle INSERT case
CREATE TRIGGER trigger_queue_verification_welcome_email_insert
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  WHEN (NEW.verification_status = 'approved')
  EXECUTE FUNCTION public.queue_verification_welcome_email();

-- Add unique constraint to prevent duplicate queue entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_email_queue_unique 
ON public.verification_email_queue (user_id) 
WHERE status = 'pending';

COMMENT ON TABLE public.verification_email_queue IS 'Queue for verification welcome emails to be processed by edge function';