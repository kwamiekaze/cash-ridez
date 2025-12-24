-- Add call notification settings columns to admin_notification_settings
ALTER TABLE public.admin_notification_settings
ADD COLUMN IF NOT EXISTS notify_call_inbound boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS notify_call_missed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS notify_call_voicemail boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS notify_call_campaign_complete boolean DEFAULT false;

-- Add direction column to admin_call_logs if not exists
ALTER TABLE public.admin_call_logs
ADD COLUMN IF NOT EXISTS direction text DEFAULT 'outbound';

-- Create index for faster lookups by direction
CREATE INDEX IF NOT EXISTS idx_admin_call_logs_direction ON public.admin_call_logs(direction);