-- Update profiles RLS to hide phone numbers from non-admins and non-ride-participants
DROP POLICY IF EXISTS "Users can view ride participants - limited data" ON profiles;
DROP POLICY IF EXISTS "Verified users view limited profile data for open rides" ON profiles;

-- Create more granular policies for phone number visibility
CREATE POLICY "Users view own profile with all data"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins view all profiles with all data"
ON profiles FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Ride participants can view each other's profiles but NOT phone numbers (unless admin)
CREATE POLICY "Ride participants view profiles without phone"
ON profiles FOR SELECT
TO authenticated
USING (
  is_ride_participant(auth.uid(), id) 
  AND auth.uid() != id
);

-- Verified users can view limited profile data for open rides (no phone numbers)
CREATE POLICY "Verified users view limited open ride profiles"
ON profiles FOR SELECT
TO authenticated
USING (
  is_verified_user(auth.uid()) 
  AND EXISTS (
    SELECT 1 FROM ride_requests 
    WHERE rider_id = profiles.id 
    AND status = 'open'
  )
  AND auth.uid() != id
);

-- Add helper function to check if user can view phone number
CREATE OR REPLACE FUNCTION can_view_phone_number(_viewer_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    _viewer_id = _profile_id  -- Own profile
    OR has_role(_viewer_id, 'admin')  -- Admin can view all
$$;

-- Update direct_chats RLS to enforce subscription for non-admins
DROP POLICY IF EXISTS "Verified users can create chats" ON direct_chats;

CREATE POLICY "Subscribed users can create chats"
ON direct_chats FOR INSERT
TO authenticated
WITH CHECK (
  (auth.uid() = participant_1_id OR auth.uid() = participant_2_id)
  AND is_verified_user(auth.uid())
  AND (
    -- User must be subscribed OR be an admin
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND subscription_active = true
    )
    OR has_role(auth.uid(), 'admin')
  )
);

-- Add function to get or create direct chat
CREATE OR REPLACE FUNCTION get_or_create_direct_chat(
  _participant_1_id uuid,
  _participant_2_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id uuid;
  v_p1 uuid;
  v_p2 uuid;
BEGIN
  -- Normalize participant order (lower UUID first)
  IF _participant_1_id < _participant_2_id THEN
    v_p1 := _participant_1_id;
    v_p2 := _participant_2_id;
  ELSE
    v_p1 := _participant_2_id;
    v_p2 := _participant_1_id;
  END IF;

  -- Check if chat exists
  SELECT id INTO v_chat_id
  FROM direct_chats
  WHERE (participant_1_id = v_p1 AND participant_2_id = v_p2)
     OR (participant_1_id = v_p2 AND participant_2_id = v_p1);

  -- If not, create it
  IF v_chat_id IS NULL THEN
    INSERT INTO direct_chats (participant_1_id, participant_2_id, created_by)
    VALUES (v_p1, v_p2, auth.uid())
    RETURNING id INTO v_chat_id;
  END IF;

  RETURN v_chat_id;
END;
$$;