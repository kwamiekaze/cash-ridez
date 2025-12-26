-- Call events table for observability (Auto Call Campaign + Call Center)
CREATE TABLE IF NOT EXISTS public.call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL, -- webhook | twilio_poll | manual_end | failsafe
  campaign_id uuid NULL,
  campaign_recipient_id uuid NULL,
  call_log_id uuid NULL,
  phone_e164 text NULL,
  twilio_call_sid text NULL,
  twilio_call_status text NULL,
  mapped_status text NULL,
  details jsonb NULL
);

CREATE INDEX IF NOT EXISTS call_events_created_at_idx ON public.call_events (created_at DESC);
CREATE INDEX IF NOT EXISTS call_events_campaign_id_idx ON public.call_events (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS call_events_call_sid_idx ON public.call_events (twilio_call_sid, created_at DESC);

ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Allow admins to read call events
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='call_events' AND policyname='Admins can read call events'
  ) THEN
    CREATE POLICY "Admins can read call events"
    ON public.call_events
    FOR SELECT
    USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;

  -- Allow service role (edge functions) to insert; admins can also insert for testing
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='call_events' AND policyname='Admins can insert call events'
  ) THEN
    CREATE POLICY "Admins can insert call events"
    ON public.call_events
    FOR INSERT
    WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;