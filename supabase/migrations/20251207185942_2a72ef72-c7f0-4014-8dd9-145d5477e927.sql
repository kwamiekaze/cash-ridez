-- Create app_settings table for global settings including admin map visibility
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Insert default admin map visibility setting
INSERT INTO public.app_settings (key, value)
VALUES ('map_settings', '{"show_admin_on_public_map": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Admins can view and update settings
CREATE POLICY "Admins can view all settings"
ON public.app_settings
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update settings"
ON public.app_settings
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert settings"
ON public.app_settings
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- All authenticated users can read map_settings for visibility checks
CREATE POLICY "Authenticated users can read map_settings"
ON public.app_settings
FOR SELECT
USING (auth.uid() IS NOT NULL AND key = 'map_settings');