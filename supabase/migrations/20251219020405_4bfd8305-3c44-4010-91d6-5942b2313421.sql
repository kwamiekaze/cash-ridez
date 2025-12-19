-- Tighten SMS security + add idempotency safeguards
--
-- Goal:
-- 1) Ensure SMS conversations/messages are visible to admins only
-- 2) Ensure inbound webhooks are idempotent (avoid duplicate inserts on retries)

-- 1) REMOVE overly-permissive policies (they currently allow public access)
DROP POLICY IF EXISTS "System can manage messages" ON public.admin_sms_messages;
DROP POLICY IF EXISTS "System can update messages" ON public.admin_sms_messages;
DROP POLICY IF EXISTS "System can manage conversations" ON public.admin_sms_conversations;
DROP POLICY IF EXISTS "System can update SMS logs" ON public.admin_sms_logs;

-- 2) Add idempotency via unique indexes on Twilio SIDs
CREATE UNIQUE INDEX IF NOT EXISTS admin_sms_messages_twilio_message_sid_uniq
  ON public.admin_sms_messages (twilio_message_sid)
  WHERE twilio_message_sid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS admin_sms_logs_message_sid_uniq
  ON public.admin_sms_logs (message_sid)
  WHERE message_sid IS NOT NULL;
