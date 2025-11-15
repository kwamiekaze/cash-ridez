-- Add driver vehicle information columns to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS car_year TEXT,
ADD COLUMN IF NOT EXISTS car_make TEXT,
ADD COLUMN IF NOT EXISTS car_model TEXT;

-- Add community chat moderation columns to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS chat_muted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS chat_blocked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS chat_message_count INTEGER DEFAULT 0;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_chat_blocked ON profiles(chat_blocked);
CREATE INDEX IF NOT EXISTS idx_profiles_chat_muted ON profiles(chat_muted);

-- Update community_messages table to track message count
CREATE OR REPLACE FUNCTION increment_user_message_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles
  SET chat_message_count = chat_message_count + 1
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER increment_message_count_trigger
AFTER INSERT ON community_messages
FOR EACH ROW
EXECUTE FUNCTION increment_user_message_count();

-- Add RLS policy to prevent blocked/muted users from posting
DROP POLICY IF EXISTS "Users can insert their own messages" ON community_messages;
CREATE POLICY "Users can insert their own messages"
ON community_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND is_verified = true
    AND chat_blocked = false
    AND (subscription_active = true OR chat_message_count < 10)
  )
);

-- Allow admins to update chat moderation fields
DROP POLICY IF EXISTS "Admins can update chat moderation" ON profiles;
CREATE POLICY "Admins can update chat moderation"
ON profiles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);