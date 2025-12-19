-- Add sms_inbound_enabled and campaign_complete_enabled columns to admin_notification_settings
ALTER TABLE public.admin_notification_settings 
ADD COLUMN IF NOT EXISTS sms_inbound_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS campaign_complete_enabled boolean NOT NULL DEFAULT true;

-- Add comments for clarity
COMMENT ON COLUMN public.admin_notification_settings.sms_inbound_enabled IS 'Whether admin receives notifications for inbound SMS replies';
COMMENT ON COLUMN public.admin_notification_settings.campaign_complete_enabled IS 'Whether admin receives notifications when campaigns complete';

-- Create index on notifications for faster admin notification lookups
CREATE INDEX IF NOT EXISTS idx_notifications_user_type_created 
ON public.notifications (user_id, type, created_at DESC);

-- Add unique constraint to prevent duplicate campaign complete notifications
-- We'll use a partial index to check for duplicates on campaign_complete type
-- Since we store campaign_id in message/link, we need to handle this in code