-- Create webhook events table for debugging inbound SMS
CREATE TABLE IF NOT EXISTS public.admin_sms_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  headers jsonb,
  raw_body text,
  from_e164 text,
  to_e164 text,
  body text,
  sms_sid text,
  messaging_service_sid text,
  num_media integer DEFAULT 0,
  insert_ok boolean DEFAULT false,
  insert_error text,
  created_at timestamptz DEFAULT now()
);

-- Add unique index on sms_sid for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_sms_sid ON public.admin_sms_webhook_events(sms_sid) WHERE sms_sid IS NOT NULL;

-- Enable RLS
ALTER TABLE public.admin_sms_webhook_events ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can view webhook events"
  ON public.admin_sms_webhook_events FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert (from edge function)
CREATE POLICY "System can insert webhook events"
  ON public.admin_sms_webhook_events FOR INSERT
  WITH CHECK (true);

-- Add admin_sms_webhook_events to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_sms_webhook_events;