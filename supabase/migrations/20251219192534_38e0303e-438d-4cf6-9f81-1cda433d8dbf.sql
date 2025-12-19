-- Add next_send_at column to admin_sms_campaigns for strict throttling
ALTER TABLE public.admin_sms_campaigns 
ADD COLUMN IF NOT EXISTS next_send_at timestamptz DEFAULT now();

-- Add index for efficient runner queries
CREATE INDEX IF NOT EXISTS idx_admin_sms_campaigns_status_next 
ON public.admin_sms_campaigns(status, next_send_at);

-- Add index for campaign recipients by status for efficient pickup
CREATE INDEX IF NOT EXISTS idx_admin_sms_campaign_recipients_campaign_status 
ON public.admin_sms_campaign_recipients(campaign_id, status, created_at);