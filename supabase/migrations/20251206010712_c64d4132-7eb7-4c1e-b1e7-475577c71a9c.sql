
-- Add notification trigger for direct messages
CREATE OR REPLACE FUNCTION public.notify_direct_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_other_user_id UUID;
  v_sender_name TEXT;
  v_participant_1 UUID;
  v_participant_2 UUID;
BEGIN
  -- Get the chat participants
  SELECT participant_1_id, participant_2_id 
  INTO v_participant_1, v_participant_2 
  FROM direct_chats 
  WHERE id = NEW.chat_id;
  
  IF v_participant_1 IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Determine the recipient (the other participant)
  IF v_participant_1 = NEW.sender_id THEN
    v_other_user_id := v_participant_2;
  ELSE
    v_other_user_id := v_participant_1;
  END IF;
  
  -- Get sender name
  SELECT COALESCE(full_name, display_name, 'Someone') INTO v_sender_name 
  FROM profiles 
  WHERE id = NEW.sender_id;
  
  -- Create notification for recipient
  IF v_other_user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, message, link, related_user_id)
    VALUES (
      v_other_user_id,
      'direct_message',
      'New Direct Message',
      v_sender_name || ' sent you a direct message',
      '/community',
      NEW.sender_id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for direct messages
DROP TRIGGER IF EXISTS trigger_notify_direct_message ON public.direct_messages;
CREATE TRIGGER trigger_notify_direct_message
  AFTER INSERT ON public.direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_direct_message();

-- Add RLS policies for admins to view/manage all direct chats
CREATE POLICY "Admins can view all direct chats"
  ON public.direct_chats
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can create direct chats with any user"
  ON public.direct_chats
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add RLS policies for admins to view all direct messages
CREATE POLICY "Admins can view all direct messages"
  ON public.direct_messages
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
