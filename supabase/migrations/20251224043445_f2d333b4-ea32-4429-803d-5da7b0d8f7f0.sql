-- Create call_center_recordings table for storing recording details and transcripts
CREATE TABLE IF NOT EXISTS public.call_center_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,
  twilio_call_sid text NOT NULL,
  twilio_recording_sid text UNIQUE,
  recording_url text,
  duration_seconds int,
  status text DEFAULT 'pending'::text,
  transcript_text text,
  transcript_json jsonb DEFAULT '{}'::jsonb
);

-- Create call_center_messages table for conversation turns
CREATE TABLE IF NOT EXISTS public.call_center_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,
  twilio_call_sid text NOT NULL,
  role text NOT NULL CHECK (role IN ('system', 'assistant', 'user')),
  content text NOT NULL,
  latency_ms int,
  provider text,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_call_center_recordings_call_sid ON public.call_center_recordings(twilio_call_sid);
CREATE INDEX IF NOT EXISTS idx_call_center_recordings_recording_sid ON public.call_center_recordings(twilio_recording_sid);
CREATE INDEX IF NOT EXISTS idx_call_center_messages_call_sid ON public.call_center_messages(twilio_call_sid);
CREATE INDEX IF NOT EXISTS idx_admin_call_logs_call_sid ON public.admin_call_logs(twilio_call_sid);

-- Enable RLS
ALTER TABLE public.call_center_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_center_messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for call_center_recordings
CREATE POLICY "Admins can view all recordings" ON public.call_center_recordings
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert recordings" ON public.call_center_recordings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update recordings" ON public.call_center_recordings
  FOR UPDATE USING (true);

-- Create RLS policies for call_center_messages
CREATE POLICY "Admins can view all messages" ON public.call_center_messages
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert messages" ON public.call_center_messages
  FOR INSERT WITH CHECK (true);