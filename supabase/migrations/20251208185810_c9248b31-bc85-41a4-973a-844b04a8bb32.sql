-- Create email_logs table for tracking sent emails and preventing duplicates
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email_type TEXT NOT NULL,
  recipient_email TEXT,
  timestamp_sent TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint to prevent duplicate emails of same type to same user
CREATE UNIQUE INDEX idx_email_logs_unique_send 
ON public.email_logs (user_id, email_type) 
WHERE status = 'success';

-- Create index for quick lookups
CREATE INDEX idx_email_logs_user_id ON public.email_logs (user_id);
CREATE INDEX idx_email_logs_email_type ON public.email_logs (email_type);
CREATE INDEX idx_email_logs_timestamp ON public.email_logs (timestamp_sent DESC);

-- Enable RLS
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can view all email logs"
ON public.email_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert email logs"
ON public.email_logs
FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update email logs"
ON public.email_logs
FOR UPDATE
USING (true);

-- Add comment for documentation
COMMENT ON TABLE public.email_logs IS 'Tracks all automated emails sent by the system to prevent duplicates and enable auditing';