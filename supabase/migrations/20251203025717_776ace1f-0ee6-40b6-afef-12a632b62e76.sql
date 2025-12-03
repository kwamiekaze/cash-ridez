-- Create function to notify users when new community messages are posted
CREATE OR REPLACE FUNCTION public.notify_community_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_sender_name TEXT;
  v_recipient RECORD;
  v_prefs JSONB;
BEGIN
  -- Get sender name
  SELECT COALESCE(full_name, display_name, 'A user') INTO v_sender_name 
  FROM public.profiles 
  WHERE id = NEW.user_id;

  -- Notify all verified users who have messages notification enabled (except sender)
  FOR v_recipient IN 
    SELECT id, notification_preferences 
    FROM public.profiles 
    WHERE id != NEW.user_id 
      AND is_verified = true
  LOOP
    v_prefs := v_recipient.notification_preferences;
    
    -- Check if user has messages notifications enabled
    IF v_prefs IS NOT NULL AND (v_prefs->>'messages')::boolean = true THEN
      PERFORM public.create_notification(
        v_recipient.id,
        'community_message',
        'New Community Message',
        v_sender_name || ' posted in Community Chat',
        '/community',
        NULL,
        NEW.user_id
      );
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for community message notifications
DROP TRIGGER IF EXISTS on_community_message_created ON public.community_messages;
CREATE TRIGGER on_community_message_created
  AFTER INSERT ON public.community_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_community_message();