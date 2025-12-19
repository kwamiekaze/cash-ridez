-- Create admin_sms_logs table for auditing SMS sends
CREATE TABLE public.admin_sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  admin_user_id uuid NOT NULL,
  to_number text NOT NULL,
  from_number text,
  messaging_service_sid text,
  body text NOT NULL,
  twilio_message_sid text,
  twilio_status text,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  segments_count integer DEFAULT 1,
  include_opt_out boolean DEFAULT true
);

-- Enable RLS
ALTER TABLE public.admin_sms_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read SMS logs
CREATE POLICY "Admins can view all SMS logs"
ON public.admin_sms_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert SMS logs
CREATE POLICY "Admins can insert SMS logs"
ON public.admin_sms_logs
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update SMS logs (for status updates via webhook)
CREATE POLICY "Admins can update SMS logs"
ON public.admin_sms_logs
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- System can update logs (for webhook status updates with service role)
CREATE POLICY "System can update SMS logs"
ON public.admin_sms_logs
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Create index on twilio_message_sid for fast webhook lookups
CREATE INDEX idx_admin_sms_logs_message_sid ON public.admin_sms_logs(twilio_message_sid);

-- Create index on admin_user_id for rate limiting queries
CREATE INDEX idx_admin_sms_logs_admin_user ON public.admin_sms_logs(admin_user_id, created_at DESC);

-- Add comment
COMMENT ON TABLE public.admin_sms_logs IS 'Audit log for admin SMS sends via Twilio';