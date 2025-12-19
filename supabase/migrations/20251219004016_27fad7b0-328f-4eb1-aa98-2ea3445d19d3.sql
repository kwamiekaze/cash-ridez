-- Create admin_sms_conversations table
CREATE TABLE public.admin_sms_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_e164 TEXT NOT NULL,
  twilio_number_e164 TEXT NOT NULL,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  last_message_preview TEXT,
  unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_conversation UNIQUE (participant_e164, twilio_number_e164)
);

-- Create admin_sms_messages table
CREATE TABLE public.admin_sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.admin_sms_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_e164 TEXT NOT NULL,
  to_e164 TEXT NOT NULL,
  body TEXT NOT NULL,
  twilio_message_sid TEXT,
  status TEXT DEFAULT 'received',
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_sms_messages_conversation ON public.admin_sms_messages(conversation_id, created_at DESC);
CREATE INDEX idx_sms_messages_sid ON public.admin_sms_messages(twilio_message_sid) WHERE twilio_message_sid IS NOT NULL;
CREATE INDEX idx_sms_conversations_last_message ON public.admin_sms_conversations(last_message_at DESC);
CREATE INDEX idx_sms_conversations_participant ON public.admin_sms_conversations(participant_e164);

-- Enable RLS
ALTER TABLE public.admin_sms_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sms_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversations
CREATE POLICY "Admins can view all conversations"
  ON public.admin_sms_conversations FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert conversations"
  ON public.admin_sms_conversations FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update conversations"
  ON public.admin_sms_conversations FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can manage conversations"
  ON public.admin_sms_conversations FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS Policies for messages
CREATE POLICY "Admins can view all messages"
  ON public.admin_sms_messages FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert messages"
  ON public.admin_sms_messages FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can manage messages"
  ON public.admin_sms_messages FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "System can update messages"
  ON public.admin_sms_messages FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_sms_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_sms_conversations;

-- Function to update conversation on new message
CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE admin_sms_conversations
  SET 
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.body, 100),
    updated_at = now(),
    unread_count = CASE 
      WHEN NEW.direction = 'inbound' THEN unread_count + 1 
      ELSE unread_count 
    END
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- Trigger to auto-update conversation
CREATE TRIGGER trg_update_conversation_on_message
  AFTER INSERT ON public.admin_sms_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_on_message();