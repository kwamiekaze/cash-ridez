-- Add call_spacing_seconds column with a sensible default for campaign pacing
ALTER TABLE admin_call_campaigns 
ADD COLUMN IF NOT EXISTS call_spacing_seconds INTEGER DEFAULT 5;

-- Update existing campaigns to use 5 second spacing
UPDATE admin_call_campaigns 
SET call_spacing_seconds = 5 
WHERE call_spacing_seconds IS NULL;