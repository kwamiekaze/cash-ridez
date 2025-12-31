-- Add chat_id to notifications for direct message deep-linking
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS chat_id uuid REFERENCES direct_chats(id);

-- Add status and end fields to direct_chats for "End Chat" functionality
ALTER TABLE direct_chats ADD COLUMN IF NOT EXISTS status text DEFAULT 'open' CHECK (status IN ('open', 'ended'));
ALTER TABLE direct_chats ADD COLUMN IF NOT EXISTS ended_by uuid REFERENCES profiles(id);
ALTER TABLE direct_chats ADD COLUMN IF NOT EXISTS ended_at timestamptz;

-- Create index for faster notification lookups by chat_id
CREATE INDEX IF NOT EXISTS idx_notifications_chat_id ON notifications(chat_id) WHERE chat_id IS NOT NULL;

-- Add notification preferences for chat messages (add to profiles if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'notify_chat_messages') THEN
    ALTER TABLE profiles ADD COLUMN notify_chat_messages boolean DEFAULT true;
  END IF;
END $$;

-- Create trigger function to notify users on new direct messages
CREATE OR REPLACE FUNCTION notify_on_direct_message()
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
  v_chat_status TEXT;
  v_should_notify BOOLEAN;
BEGIN
  -- Get the chat participants and status
  SELECT participant_1_id, participant_2_id, status
  INTO v_participant_1, v_participant_2, v_chat_status
  FROM direct_chats 
  WHERE id = NEW.chat_id;
  
  IF v_participant_1 IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Don't notify if chat is ended
  IF v_chat_status = 'ended' THEN
    RETURN NEW;
  END IF;
  
  -- Determine the recipient (the other participant)
  IF v_participant_1 = NEW.sender_id THEN
    v_other_user_id := v_participant_2;
  ELSE
    v_other_user_id := v_participant_1;
  END IF;
  
  -- Check if recipient wants chat notifications
  SELECT COALESCE(notify_chat_messages, true) INTO v_should_notify
  FROM profiles WHERE id = v_other_user_id;
  
  IF NOT v_should_notify THEN
    RETURN NEW;
  END IF;
  
  -- Get sender name
  SELECT COALESCE(full_name, display_name, 'Someone') INTO v_sender_name 
  FROM profiles 
  WHERE id = NEW.sender_id;
  
  -- Check if sender is admin
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = NEW.sender_id AND role = 'admin') THEN
    v_sender_name := 'CashRidez Support';
  END IF;
  
  -- Create notification for recipient with chat_id for deep-linking
  IF v_other_user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, message, link, related_user_id, chat_id, read, created_at)
    VALUES (
      v_other_user_id,
      'direct_message',
      'New Message',
      v_sender_name || ' sent you a message',
      '/dashboard?openChat=' || NEW.chat_id::text,
      NEW.sender_id,
      NEW.chat_id,
      false,
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_notify_direct_message ON direct_messages;
CREATE TRIGGER trigger_notify_direct_message
  AFTER INSERT ON direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_direct_message();

-- Add trigger for email campaign completion notifications to admins
CREATE OR REPLACE FUNCTION notify_admins_email_campaign_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_record RECORD;
  v_campaign_name TEXT;
  v_message TEXT;
BEGIN
  -- Only trigger when status changes to 'completed' or 'failed'
  IF (NEW.status = 'completed' OR NEW.status = 'failed') 
     AND (OLD.status IS NULL OR OLD.status NOT IN ('completed', 'failed')) THEN
    
    v_campaign_name := COALESCE(NEW.name, 'Untitled Campaign');
    v_message := 'Campaign "' || v_campaign_name || '" finished. Sent: ' || 
                 COALESCE(NEW.sent_count, 0) || ', Failed: ' || COALESCE(NEW.failed_count, 0);
    
    -- Notify all admins who have campaign_complete_enabled
    FOR v_admin_record IN
      SELECT ans.admin_id
      FROM admin_notification_settings ans
      INNER JOIN user_roles ur ON ur.user_id = ans.admin_id AND ur.role = 'admin'
      WHERE ans.campaign_complete_enabled = true
    LOOP
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        link,
        read,
        created_at
      ) VALUES (
        v_admin_record.admin_id,
        'email_campaign_finished',
        'Email Campaign ' || CASE WHEN NEW.status = 'completed' THEN 'Completed' ELSE 'Failed' END,
        v_message,
        '/admin/email?tab=logs&campaign=' || NEW.id,
        false,
        NOW()
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_notify_email_campaign_complete ON admin_email_campaigns;
CREATE TRIGGER trigger_notify_email_campaign_complete
  AFTER UPDATE ON admin_email_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION notify_admins_email_campaign_complete();