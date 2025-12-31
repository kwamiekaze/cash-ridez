-- Email Center Database Tables (mirroring SMS Center structure)

-- Admin Email Campaigns (mirroring admin_sms_campaigns)
CREATE TABLE public.admin_email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  name TEXT,
  sender TEXT NOT NULL DEFAULT 'connect@cashridez.com',
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed', 'cancelled')),
  total_recipients INTEGER DEFAULT 0,
  queued_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_error TEXT,
  next_send_at TIMESTAMPTZ,
  throttle_seconds INTEGER NOT NULL DEFAULT 2
);

-- Admin Email Campaign Recipients (mirroring admin_sms_campaign_recipients)
CREATE TABLE public.admin_email_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.admin_email_campaigns(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_line TEXT,
  first_name TEXT,
  email TEXT NOT NULL,
  subject_rendered TEXT NOT NULL,
  body_rendered TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped')),
  error TEXT,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  lock_id UUID,
  resend_message_id TEXT
);

-- Admin Email Worker Runs (mirroring admin_sms_worker_runs)
CREATE TABLE public.admin_email_worker_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'scheduler',
  processed_campaign_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  processed_recipients_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB,
  duration_ms INTEGER
);

-- Indexes for performance
CREATE INDEX idx_email_campaigns_status ON public.admin_email_campaigns(status);
CREATE INDEX idx_email_campaigns_created_by ON public.admin_email_campaigns(created_by);
CREATE INDEX idx_email_recipients_campaign_id ON public.admin_email_campaign_recipients(campaign_id);
CREATE INDEX idx_email_recipients_status ON public.admin_email_campaign_recipients(status);
CREATE INDEX idx_email_recipients_locked_at ON public.admin_email_campaign_recipients(locked_at) WHERE locked_at IS NOT NULL;
CREATE INDEX idx_email_worker_runs_ran_at ON public.admin_email_worker_runs(ran_at);

-- Update email_logs to track admin-sent emails and add subject column
ALTER TABLE public.email_logs 
ADD COLUMN IF NOT EXISTS subject TEXT,
ADD COLUMN IF NOT EXISTS admin_user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.admin_email_campaigns(id),
ADD COLUMN IF NOT EXISTS campaign_recipient_id UUID REFERENCES public.admin_email_campaign_recipients(id),
ADD COLUMN IF NOT EXISTS body_preview TEXT,
ADD COLUMN IF NOT EXISTS resend_message_id TEXT;

-- Enable RLS
ALTER TABLE public.admin_email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_email_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_email_worker_runs ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Admin only access
CREATE POLICY "Admins can manage email campaigns"
ON public.admin_email_campaigns
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage email campaign recipients"
ON public.admin_email_campaign_recipients
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view email worker runs"
ON public.admin_email_worker_runs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Enable realtime for campaigns
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_email_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_email_campaign_recipients;

-- Function to claim email recipient for processing (atomic locking like SMS)
CREATE OR REPLACE FUNCTION public.claim_email_recipient(
  p_campaign_id UUID,
  p_lock_id UUID,
  p_stale_threshold INTERVAL DEFAULT '5 minutes'::interval
)
RETURNS SETOF public.admin_email_campaign_recipients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient_id UUID;
BEGIN
  -- Select one queued recipient that is either unlocked or has a stale lock
  SELECT id INTO v_recipient_id
  FROM admin_email_campaign_recipients
  WHERE campaign_id = p_campaign_id
    AND status = 'queued'
    AND (locked_at IS NULL OR locked_at < (NOW() - p_stale_threshold))
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF v_recipient_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Lock the recipient
  UPDATE admin_email_campaign_recipients
  SET 
    locked_at = NOW(),
    lock_id = p_lock_id,
    last_attempt_at = NOW()
  WHERE id = v_recipient_id;
  
  RETURN QUERY 
  SELECT * FROM admin_email_campaign_recipients WHERE id = v_recipient_id;
END;
$$;