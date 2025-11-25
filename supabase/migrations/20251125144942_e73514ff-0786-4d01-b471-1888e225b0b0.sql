-- Update can_use_trip_features to check both subscription_active AND subscription_status
CREATE OR REPLACE FUNCTION public.can_use_trip_features(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_subscription_active BOOLEAN;
  v_subscription_status TEXT;
  v_completed_trips INTEGER;
BEGIN
  SELECT subscription_active, subscription_status, completed_trips_count
  INTO v_subscription_active, v_subscription_status, v_completed_trips
  FROM profiles
  WHERE id = p_user_id;
  
  -- Check if user has active premium subscription
  IF v_subscription_active = true AND 
     (v_subscription_status = 'active' OR v_subscription_status = 'trialing') THEN
    RETURN TRUE;
  END IF;
  
  -- If not subscribed, check trip count (max 3 free trips)
  RETURN v_completed_trips < 3;
END;
$function$;

-- Update community_messages RLS policy to check both subscription fields
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
      (profiles.subscription_active = true AND 
       (profiles.subscription_status = 'active' OR profiles.subscription_status = 'trialing'))
      OR profiles.chat_message_count < 10
    )
  )
);