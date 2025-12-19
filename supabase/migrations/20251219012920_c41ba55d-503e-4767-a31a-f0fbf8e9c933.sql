-- Add inbound-compatible fields to admin_sms_logs (non-destructive)
ALTER TABLE public.admin_sms_logs
ADD COLUMN IF NOT EXISTS direction text;

ALTER TABLE public.admin_sms_logs
ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.admin_sms_logs
ADD COLUMN IF NOT EXISTS message_sid text;

-- Helpful indexes for diagnostics + filtering
CREATE INDEX IF NOT EXISTS idx_admin_sms_logs_direction_created_at
ON public.admin_sms_logs (direction, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_sms_logs_message_sid
ON public.admin_sms_logs (message_sid);