-- ================================================
-- SMS DRAFTS AND SEND LOCK TABLES
-- ================================================

-- Table for storing SMS drafts before manual sending
CREATE TABLE public.admin_sms_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by_admin_id UUID NOT NULL,
  recipient_name TEXT,
  recipient_phone TEXT NOT NULL,
  message_body_final TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMP WITH TIME ZONE,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  twilio_message_sid TEXT,
  conversation_id UUID,
  source TEXT DEFAULT 'manual',
  source_campaign_id UUID,
  source_recipient_id UUID,
  CONSTRAINT valid_status CHECK (status IN ('draft', 'sending', 'sent', 'failed', 'skipped'))
);

-- Index for fast lookup by admin and status
CREATE INDEX idx_admin_sms_drafts_admin_status ON public.admin_sms_drafts(created_by_admin_id, status);
CREATE INDEX idx_admin_sms_drafts_status ON public.admin_sms_drafts(status);
CREATE INDEX idx_admin_sms_drafts_phone ON public.admin_sms_drafts(recipient_phone);

-- Enable RLS
ALTER TABLE public.admin_sms_drafts ENABLE ROW LEVEL SECURITY;

-- RLS policies for admin_sms_drafts
CREATE POLICY "Admins can view all drafts"
  ON public.admin_sms_drafts FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert drafts"
  ON public.admin_sms_drafts FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update drafts"
  ON public.admin_sms_drafts FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete drafts"
  ON public.admin_sms_drafts FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Global send lock table (single row for global cooldown)
CREATE TABLE public.admin_sms_send_lock (
  id TEXT NOT NULL DEFAULT 'global' PRIMARY KEY,
  locked_until TIMESTAMP WITH TIME ZONE,
  last_sent_at TIMESTAMP WITH TIME ZONE,
  last_sent_by_admin_id UUID,
  last_sent_draft_id UUID,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert the global lock row
INSERT INTO public.admin_sms_send_lock (id) VALUES ('global');

-- Enable RLS
ALTER TABLE public.admin_sms_send_lock ENABLE ROW LEVEL SECURITY;

-- RLS policies for send lock
CREATE POLICY "Admins can view send lock"
  ON public.admin_sms_send_lock FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update send lock"
  ON public.admin_sms_send_lock FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for drafts table
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_sms_drafts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_sms_send_lock;