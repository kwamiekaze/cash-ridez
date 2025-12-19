-- Create admin_sms_campaigns table
CREATE TABLE public.admin_sms_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  name text,
  sender text NOT NULL,
  template text NOT NULL,
  opt_out_footer_enabled boolean DEFAULT true,
  opt_out_footer_text text DEFAULT 'Reply STOP to opt out.',
  status text NOT NULL DEFAULT 'draft',
  total_recipients int DEFAULT 0,
  queued_count int DEFAULT 0,
  sent_count int DEFAULT 0,
  failed_count int DEFAULT 0,
  skipped_count int DEFAULT 0,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz
);

-- Create admin_sms_campaign_recipients table
CREATE TABLE public.admin_sms_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  campaign_id uuid NOT NULL REFERENCES admin_sms_campaigns(id) ON DELETE CASCADE,
  raw_line text,
  first_name text,
  phone_raw text,
  phone_e164 text NOT NULL,
  message_rendered text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  twilio_sid text,
  error text,
  sent_at timestamptz
);

-- Create admin_sms_rate_limits table
CREATE TABLE public.admin_sms_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  scope text NOT NULL UNIQUE,
  minute_window_start timestamptz NOT NULL DEFAULT now(),
  minute_count int NOT NULL DEFAULT 0,
  hour_window_start timestamptz NOT NULL DEFAULT now(),
  hour_count int NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Create admin_sms_opt_outs table for STOP/UNSUBSCRIBE tracking
CREATE TABLE public.admin_sms_opt_outs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  phone_e164 text NOT NULL UNIQUE,
  opted_out_at timestamptz NOT NULL DEFAULT now(),
  source text DEFAULT 'inbound_stop'
);

-- Create indexes
CREATE INDEX idx_campaign_recipients_campaign_status ON admin_sms_campaign_recipients(campaign_id, status, created_at);
CREATE INDEX idx_campaign_recipients_phone ON admin_sms_campaign_recipients(phone_e164);
CREATE INDEX idx_campaigns_status ON admin_sms_campaigns(status, created_at);
CREATE INDEX idx_opt_outs_phone ON admin_sms_opt_outs(phone_e164);

-- Enable RLS
ALTER TABLE admin_sms_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sms_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sms_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sms_opt_outs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admin_sms_campaigns
CREATE POLICY "Admins can view all campaigns" ON admin_sms_campaigns
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert campaigns" ON admin_sms_campaigns
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update campaigns" ON admin_sms_campaigns
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete campaigns" ON admin_sms_campaigns
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for admin_sms_campaign_recipients
CREATE POLICY "Admins can view all recipients" ON admin_sms_campaign_recipients
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert recipients" ON admin_sms_campaign_recipients
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update recipients" ON admin_sms_campaign_recipients
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete recipients" ON admin_sms_campaign_recipients
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for admin_sms_rate_limits (service role access + admin view)
CREATE POLICY "Admins can view rate limits" ON admin_sms_rate_limits
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can manage rate limits" ON admin_sms_rate_limits
  FOR ALL USING (true) WITH CHECK (true);

-- RLS Policies for admin_sms_opt_outs
CREATE POLICY "Admins can view opt outs" ON admin_sms_opt_outs
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert opt outs" ON admin_sms_opt_outs
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert opt outs" ON admin_sms_opt_outs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can delete opt outs" ON admin_sms_opt_outs
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for campaigns and recipients
ALTER PUBLICATION supabase_realtime ADD TABLE admin_sms_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE admin_sms_campaign_recipients;

-- Initialize global rate limit row
INSERT INTO admin_sms_rate_limits (scope, minute_window_start, minute_count, hour_window_start, hour_count)
VALUES ('global', now(), 0, now(), 0)
ON CONFLICT (scope) DO NOTHING;