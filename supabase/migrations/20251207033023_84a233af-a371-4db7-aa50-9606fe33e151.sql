-- Create page_views table for tracking all user visits
CREATE TABLE public.page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name_snapshot text,
  user_identifier_snapshot text,
  email_snapshot text,
  verification_status_snapshot text,
  is_subscribed boolean DEFAULT false,
  subscription_status_snapshot text,
  role_snapshot text,
  path text NOT NULL,
  page_label text NOT NULL,
  device_type text,
  referrer text
);

-- Create index for efficient querying
CREATE INDEX idx_page_views_created_at ON public.page_views(created_at DESC);
CREATE INDEX idx_page_views_user_id ON public.page_views(user_id);
CREATE INDEX idx_page_views_path ON public.page_views(path);

-- Enable RLS
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

-- Policy: Any authenticated user can insert their own page view
CREATE POLICY "Users can insert own page views"
ON public.page_views
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Policy: Allow anonymous inserts for non-logged-in visitors
CREATE POLICY "Anonymous can insert page views"
ON public.page_views
FOR INSERT
TO anon
WITH CHECK (user_id IS NULL);

-- Policy: Only admins can view all page views
CREATE POLICY "Admins can view all page views"
ON public.page_views
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));