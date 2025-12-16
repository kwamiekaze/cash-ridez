-- Create admin notification settings table
CREATE TABLE public.admin_notification_settings (
  admin_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notify_on_new_visit boolean NOT NULL DEFAULT false,
  notify_channel text NOT NULL DEFAULT 'in_app',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_notification_settings ENABLE ROW LEVEL SECURITY;

-- RLS: Admins can read/update only their own row
CREATE POLICY "Admins can view own settings"
ON public.admin_notification_settings
FOR SELECT
USING (auth.uid() = admin_id AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert own settings"
ON public.admin_notification_settings
FOR INSERT
WITH CHECK (auth.uid() = admin_id AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update own settings"
ON public.admin_notification_settings
FOR UPDATE
USING (auth.uid() = admin_id AND has_role(auth.uid(), 'admin'::app_role));

-- Create function to notify admins on new page view
CREATE OR REPLACE FUNCTION public.notify_admins_on_page_view()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_admin_record RECORD;
  v_visitor_name TEXT;
  v_message TEXT;
BEGIN
  -- Build visitor name
  v_visitor_name := COALESCE(NEW.full_name_snapshot, 'Anonymous visitor');
  
  -- Build message
  IF NEW.full_name_snapshot IS NOT NULL THEN
    v_message := v_visitor_name || ' visited ' || COALESCE(NEW.page_label, NEW.path);
  ELSE
    v_message := 'New visitor visited ' || COALESCE(NEW.page_label, NEW.path);
  END IF;
  
  -- Find admins who want notifications
  FOR v_admin_record IN
    SELECT ans.admin_id
    FROM admin_notification_settings ans
    INNER JOIN user_roles ur ON ur.user_id = ans.admin_id AND ur.role = 'admin'
    WHERE ans.notify_on_new_visit = true
  LOOP
    -- Insert notification for each opted-in admin
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      link,
      related_user_id,
      read,
      created_at
    ) VALUES (
      v_admin_record.admin_id,
      'new_visit',
      'New visit',
      v_message,
      '/admin?tab=analytics',
      NEW.user_id,
      false,
      NOW()
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Create trigger on page_views table
CREATE TRIGGER trigger_notify_admins_on_page_view
AFTER INSERT ON public.page_views
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_on_page_view();

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_admin_notification_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger to update updated_at
CREATE TRIGGER update_admin_notification_settings_updated_at
BEFORE UPDATE ON public.admin_notification_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_admin_notification_settings_updated_at();