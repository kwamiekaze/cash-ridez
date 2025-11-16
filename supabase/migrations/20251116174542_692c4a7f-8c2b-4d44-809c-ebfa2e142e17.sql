-- Create chat room invites table
CREATE TABLE IF NOT EXISTS public.chat_room_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  invited_user_id UUID NOT NULL,
  invited_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(room_id, invited_user_id)
);

-- Enable RLS
ALTER TABLE public.chat_room_invites ENABLE ROW LEVEL SECURITY;

-- Policies for chat room invites
CREATE POLICY "Users can view own invites"
  ON public.chat_room_invites
  FOR SELECT
  USING (auth.uid() = invited_user_id);

CREATE POLICY "Users can update own invites"
  ON public.chat_room_invites
  FOR UPDATE
  USING (auth.uid() = invited_user_id);

CREATE POLICY "Admins can manage invites"
  ON public.chat_room_invites
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Create function to notify user of chat room invite
CREATE OR REPLACE FUNCTION public.notify_chat_room_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inviter_name TEXT;
  v_room_name TEXT;
BEGIN
  -- Get inviter name
  SELECT display_name INTO v_inviter_name FROM profiles WHERE id = NEW.invited_by;
  
  -- Get room name
  SELECT name INTO v_room_name FROM chat_rooms WHERE id = NEW.room_id;
  
  -- Create notification
  PERFORM create_notification(
    NEW.invited_user_id,
    'chat_room_invite',
    'Chat Room Invitation',
    COALESCE(v_inviter_name, 'An admin') || ' has invited you to join the chat room: ' || COALESCE(v_room_name, 'Unknown'),
    '/community?tab=invites',
    NULL,
    NEW.invited_by
  );
  
  RETURN NEW;
END;
$$;

-- Trigger for chat room invite notifications
CREATE TRIGGER trigger_notify_chat_room_invite
  AFTER INSERT ON public.chat_room_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_chat_room_invite();

-- Update community_messages RLS to remove 24 hour restriction
DROP POLICY IF EXISTS "Verified users can read recent messages" ON public.community_messages;

CREATE POLICY "Verified users can read all messages"
  ON public.community_messages
  FOR SELECT
  USING (is_verified_user(auth.uid()));

-- Add chat moderation columns to profiles if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'chat_rooms_banned_from'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN chat_rooms_banned_from UUID[] DEFAULT '{}';
  END IF;
END $$;

-- Create direct message chats table (separate from ride messages)
CREATE TABLE IF NOT EXISTS public.direct_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  participant_1_id UUID NOT NULL,
  participant_2_id UUID NOT NULL,
  chat_name TEXT,
  created_by UUID NOT NULL,
  UNIQUE(participant_1_id, participant_2_id)
);

-- Enable RLS
ALTER TABLE public.direct_chats ENABLE ROW LEVEL SECURITY;

-- Policies for direct chats
CREATE POLICY "Participants can view their chats"
  ON public.direct_chats
  FOR SELECT
  USING (auth.uid() = participant_1_id OR auth.uid() = participant_2_id);

CREATE POLICY "Verified users can create chats"
  ON public.direct_chats
  FOR INSERT
  WITH CHECK (
    (auth.uid() = participant_1_id OR auth.uid() = participant_2_id)
    AND is_verified_user(auth.uid())
    AND (
      -- Allow if user is subscribed
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND subscription_active = true)
      -- Or if admin
      OR has_role(auth.uid(), 'admin')
    )
  );

CREATE POLICY "Participants can update chat names"
  ON public.direct_chats
  FOR UPDATE
  USING (auth.uid() = participant_1_id OR auth.uid() = participant_2_id);

-- Direct messages table
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.direct_chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  attachment_url TEXT
);

-- Enable RLS
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Policies for direct messages
CREATE POLICY "Participants can view messages"
  ON public.direct_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM direct_chats 
      WHERE direct_chats.id = direct_messages.chat_id 
      AND (direct_chats.participant_1_id = auth.uid() OR direct_chats.participant_2_id = auth.uid())
    )
  );

CREATE POLICY "Participants can send messages"
  ON public.direct_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM direct_chats 
      WHERE direct_chats.id = direct_messages.chat_id 
      AND (direct_chats.participant_1_id = auth.uid() OR direct_chats.participant_2_id = auth.uid())
    )
  );