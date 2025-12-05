-- Add referral columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
ADD COLUMN IF NOT EXISTS referral_code_locked boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS referred_by_user_id uuid REFERENCES public.profiles(id);

-- Create index for referral_code lookups (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code_lower ON public.profiles (LOWER(referral_code));

-- Create referrals table to track relationships
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  note text,
  CONSTRAINT unique_referred_user UNIQUE (referred_user_id)
);

-- Enable RLS on referrals table
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- RLS policies for referrals table
-- Users can see their own referrals (people they referred)
CREATE POLICY "Users can view their own referrals"
ON public.referrals
FOR SELECT
USING (referrer_user_id = auth.uid());

-- Users can see who referred them
CREATE POLICY "Users can view who referred them"
ON public.referrals
FOR SELECT
USING (referred_user_id = auth.uid());

-- Admins can do everything on referrals
CREATE POLICY "Admins have full access to referrals"
ON public.referrals
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- System/service role can insert referrals (for signup flow)
CREATE POLICY "System can insert referrals"
ON public.referrals
FOR INSERT
WITH CHECK (true);

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION public.generate_unique_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  LOOP
    -- Generate 8-character alphanumeric code
    new_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
    
    -- Check if code already exists (case-insensitive)
    SELECT EXISTS(SELECT 1 FROM profiles WHERE LOWER(referral_code) = LOWER(new_code)) INTO code_exists;
    
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  RETURN new_code;
END;
$$;

-- Function to process referral on signup
CREATE OR REPLACE FUNCTION public.process_referral(
  p_new_user_id uuid,
  p_referral_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id uuid;
  v_result jsonb;
BEGIN
  -- If no referral code provided, just return success
  IF p_referral_code IS NULL OR trim(p_referral_code) = '' THEN
    RETURN jsonb_build_object('success', true, 'message', 'No referral code provided');
  END IF;
  
  -- Find referrer by code (case-insensitive)
  SELECT id INTO v_referrer_id
  FROM profiles
  WHERE LOWER(referral_code) = LOWER(trim(p_referral_code))
    AND id != p_new_user_id; -- Can't refer yourself
  
  -- If no match found, silently succeed (don't error)
  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'Referral code not found, ignored');
  END IF;
  
  -- Check if user is already referred
  IF EXISTS(SELECT 1 FROM referrals WHERE referred_user_id = p_new_user_id) THEN
    RETURN jsonb_build_object('success', true, 'message', 'User already has a referrer');
  END IF;
  
  -- Update the new user's profile with referred_by
  UPDATE profiles
  SET referred_by_user_id = v_referrer_id
  WHERE id = p_new_user_id;
  
  -- Create referral record
  INSERT INTO referrals (referrer_user_id, referred_user_id)
  VALUES (v_referrer_id, p_new_user_id);
  
  -- Lock the referrer's code since they now have referrals
  UPDATE profiles
  SET referral_code_locked = true
  WHERE id = v_referrer_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'Referral processed successfully', 'referrer_id', v_referrer_id);
END;
$$;

-- Function to set/update referral code for a user
CREATE OR REPLACE FUNCTION public.set_referral_code(
  p_user_id uuid,
  p_new_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_locked boolean;
  v_has_referrals boolean;
  v_clean_code text;
BEGIN
  -- Clean and validate the code
  v_clean_code := upper(trim(p_new_code));
  
  -- Validate format: 4-20 alphanumeric characters
  IF v_clean_code !~ '^[A-Z0-9]{4,20}$' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Code must be 4-20 alphanumeric characters');
  END IF;
  
  -- Check if user's code is locked
  SELECT referral_code_locked INTO v_current_locked
  FROM profiles WHERE id = p_user_id;
  
  IF v_current_locked = true THEN
    RETURN jsonb_build_object('success', false, 'message', 'Your referral code is locked and cannot be changed');
  END IF;
  
  -- Check if user has any referrals
  SELECT EXISTS(SELECT 1 FROM referrals WHERE referrer_user_id = p_user_id) INTO v_has_referrals;
  
  IF v_has_referrals THEN
    RETURN jsonb_build_object('success', false, 'message', 'You cannot change your code after someone has used it');
  END IF;
  
  -- Check if code is unique (case-insensitive)
  IF EXISTS(SELECT 1 FROM profiles WHERE LOWER(referral_code) = LOWER(v_clean_code) AND id != p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'This code is already taken');
  END IF;
  
  -- Update the code and lock it
  UPDATE profiles
  SET referral_code = v_clean_code,
      referral_code_locked = true
  WHERE id = p_user_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'Referral code updated successfully');
END;
$$;

-- Trigger to auto-generate referral code for new profiles
CREATE OR REPLACE FUNCTION public.auto_generate_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_unique_referral_code();
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for new profile creation
DROP TRIGGER IF EXISTS trigger_auto_generate_referral_code ON public.profiles;
CREATE TRIGGER trigger_auto_generate_referral_code
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.auto_generate_referral_code();

-- Backfill existing profiles with referral codes
UPDATE public.profiles
SET referral_code = generate_unique_referral_code()
WHERE referral_code IS NULL;

-- Add realtime for referrals table
ALTER PUBLICATION supabase_realtime ADD TABLE public.referrals;