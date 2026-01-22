-- Add sms_opt_in column to profiles table for A2P 10DLC compliance
-- This tracks explicit user consent for SMS messaging

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sms_opt_in boolean NOT NULL DEFAULT false;

-- Add index for efficient queries when filtering by SMS consent
CREATE INDEX IF NOT EXISTS idx_profiles_sms_opt_in ON public.profiles(sms_opt_in) WHERE sms_opt_in = true;

-- Add comment to document the field
COMMENT ON COLUMN public.profiles.sms_opt_in IS 'User explicitly opted in to receive SMS messages from CashRidez. Required for A2P 10DLC compliance.';