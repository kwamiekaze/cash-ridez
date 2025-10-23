-- Backfill member badges for existing active subscriptions
-- This ensures all currently subscribed users have is_member = true

UPDATE profiles
SET is_member = true
WHERE subscription_active = true 
  AND subscription_status = 'active'
  AND is_member = false;

-- Add comment for documentation
COMMENT ON COLUMN profiles.is_member IS 'Member badge status - true for active subscribers. Updated via Stripe webhooks.';
