-- Add full-text search vector column to admin_sms_messages
ALTER TABLE admin_sms_messages 
ADD COLUMN IF NOT EXISTS body_tsv tsvector 
GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS admin_sms_messages_body_tsv_idx 
ON admin_sms_messages USING gin (body_tsv);

-- Add index on conversation_id + created_at for faster message retrieval
CREATE INDEX IF NOT EXISTS admin_sms_messages_conv_created_idx 
ON admin_sms_messages (conversation_id, created_at DESC);

-- Create a search function for conversations that matches phone, name, or message body
CREATE OR REPLACE FUNCTION search_sms_conversations(search_term text)
RETURNS TABLE (
  id uuid,
  participant_e164 text,
  twilio_number_e164 text,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count int,
  created_at timestamptz,
  updated_at timestamptz,
  matched_message_preview text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH matched_convs AS (
    -- Match by phone number
    SELECT DISTINCT c.id as conv_id, NULL::text as snippet
    FROM admin_sms_conversations c
    WHERE c.participant_e164 ILIKE '%' || search_term || '%'
    
    UNION
    
    -- Match by message body using full-text search
    SELECT DISTINCT m.conversation_id as conv_id, 
           LEFT(m.body, 100) as snippet
    FROM admin_sms_messages m
    WHERE m.body_tsv @@ plainto_tsquery('english', search_term)
       OR m.body ILIKE '%' || search_term || '%'
  )
  SELECT 
    c.id,
    c.participant_e164,
    c.twilio_number_e164,
    c.last_message_at,
    c.last_message_preview,
    c.unread_count,
    c.created_at,
    c.updated_at,
    mc.snippet as matched_message_preview
  FROM admin_sms_conversations c
  INNER JOIN matched_convs mc ON mc.conv_id = c.id
  ORDER BY c.last_message_at DESC;
END;
$$;

-- Grant execute permission to authenticated users (admins check via RLS)
GRANT EXECUTE ON FUNCTION search_sms_conversations(text) TO authenticated;