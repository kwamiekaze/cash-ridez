-- Add locking and pacing columns to admin_call_campaigns
ALTER TABLE admin_call_campaigns
ADD COLUMN IF NOT EXISTS lock_owner text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS lock_expires_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS next_run_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS active_call_sid text DEFAULT NULL;

-- Update default call_spacing_seconds to 30 for new campaigns
ALTER TABLE admin_call_campaigns
ALTER COLUMN call_spacing_seconds SET DEFAULT 30;

-- Create unique index to prevent future duplicate phone numbers in active campaign recipients
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_recipient_phone_unique 
ON admin_call_campaign_recipients (campaign_id, phone_e164) 
WHERE status IN ('queued', 'calling', 'ringing', 'in-progress');

-- Create index on next_run_at for efficient cron queries
CREATE INDEX IF NOT EXISTS idx_campaigns_next_run 
ON admin_call_campaigns (status, next_run_at) 
WHERE status = 'running';