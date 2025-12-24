-- Call Center: Call campaigns table
CREATE TABLE public.admin_call_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, running, paused, completed, cancelled
  total_recipients INTEGER DEFAULT 0,
  queued_count INTEGER DEFAULT 0,
  called_count INTEGER DEFAULT 0,
  answered_count INTEGER DEFAULT 0,
  voicemail_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  last_call_at TIMESTAMPTZ
);

-- Call Center: Call campaign recipients table
CREATE TABLE public.admin_call_campaign_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  campaign_id UUID NOT NULL REFERENCES public.admin_call_campaigns(id) ON DELETE CASCADE,
  first_name TEXT,
  phone_raw TEXT,
  phone_e164 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- queued, calling, answered, voicemail, failed, skipped
  call_started_at TIMESTAMPTZ,
  call_ended_at TIMESTAMPTZ,
  call_duration_seconds INTEGER,
  twilio_call_sid TEXT,
  recording_url TEXT,
  recording_duration_seconds INTEGER,
  voicemail_left BOOLEAN DEFAULT false,
  error_message TEXT,
  attempt_count INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ
);

-- Call Center: Call history/logs table (for all calls including single calls)
CREATE TABLE public.admin_call_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  admin_user_id UUID NOT NULL,
  campaign_id UUID REFERENCES public.admin_call_campaigns(id),
  campaign_recipient_id UUID REFERENCES public.admin_call_campaign_recipients(id),
  first_name TEXT,
  phone_e164 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'initiated', -- initiated, ringing, in-progress, answered, voicemail, completed, failed, no-answer, busy
  call_type TEXT NOT NULL DEFAULT 'outbound', -- outbound, voicemail
  twilio_call_sid TEXT,
  call_started_at TIMESTAMPTZ,
  call_answered_at TIMESTAMPTZ,
  call_ended_at TIMESTAMPTZ,
  call_duration_seconds INTEGER,
  recording_url TEXT,
  recording_sid TEXT,
  recording_duration_seconds INTEGER,
  voicemail_left BOOLEAN DEFAULT false,
  ai_conversation_summary TEXT,
  error_code TEXT,
  error_message TEXT
);

-- Enable RLS
ALTER TABLE public.admin_call_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_call_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_call_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for admin_call_campaigns
CREATE POLICY "Admins can view all call campaigns"
  ON public.admin_call_campaigns FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert call campaigns"
  ON public.admin_call_campaigns FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update call campaigns"
  ON public.admin_call_campaigns FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete call campaigns"
  ON public.admin_call_campaigns FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for admin_call_campaign_recipients
CREATE POLICY "Admins can view all call campaign recipients"
  ON public.admin_call_campaign_recipients FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert call campaign recipients"
  ON public.admin_call_campaign_recipients FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update call campaign recipients"
  ON public.admin_call_campaign_recipients FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete call campaign recipients"
  ON public.admin_call_campaign_recipients FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for admin_call_logs
CREATE POLICY "Admins can view all call logs"
  ON public.admin_call_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert call logs"
  ON public.admin_call_logs FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update call logs"
  ON public.admin_call_logs FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert call logs"
  ON public.admin_call_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update call logs"
  ON public.admin_call_logs FOR UPDATE
  USING (true);

-- Enable realtime for call logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_call_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_call_campaign_recipients;