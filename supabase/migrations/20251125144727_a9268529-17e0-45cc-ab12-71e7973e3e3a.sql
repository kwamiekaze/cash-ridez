-- Update ride_requests INSERT policy to enforce trip limits using existing can_use_trip_features function
DROP POLICY IF EXISTS "Verified users can create requests" ON ride_requests;

CREATE POLICY "Verified users can create requests" 
ON ride_requests
FOR INSERT
WITH CHECK (
  auth.uid() = rider_id 
  AND is_verified_user(auth.uid())
  AND can_use_trip_features(auth.uid())
);

-- Ensure community_messages INSERT policy strictly enforces the 10 message limit for non-subscribers
-- This policy already exists but we're recreating it to ensure it's correct
DROP POLICY IF EXISTS "Users can insert their own messages" ON community_messages;

CREATE POLICY "Users can insert their own messages"
ON community_messages
FOR INSERT
WITH CHECK (
  auth.uid() = user_id 
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_verified = true
    AND profiles.chat_blocked = false
    AND (
      profiles.subscription_active = true 
      OR profiles.chat_message_count < 10
    )
  )
);