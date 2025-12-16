-- Update notify_admins_on_page_view to skip notifications for admin visitors
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
  v_visitor_is_admin BOOLEAN := false;
BEGIN
  -- Check if visitor is an admin (skip all notifications for admin visits)
  IF NEW.user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM user_roles 
      WHERE user_id = NEW.user_id AND role = 'admin'
    ) INTO v_visitor_is_admin;
    
    -- If visitor is an admin, don't notify anyone
    IF v_visitor_is_admin THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Build visitor name
  v_visitor_name := COALESCE(NEW.full_name_snapshot, 'Anonymous visitor');
  
  -- Build message
  IF NEW.full_name_snapshot IS NOT NULL THEN
    v_message := v_visitor_name || ' visited ' || COALESCE(NEW.page_label, NEW.path);
  ELSE
    v_message := 'New visitor visited ' || COALESCE(NEW.page_label, NEW.path);
  END IF;
  
  -- Find admins who want notifications (excluding the visitor if they somehow match)
  FOR v_admin_record IN
    SELECT ans.admin_id
    FROM admin_notification_settings ans
    INNER JOIN user_roles ur ON ur.user_id = ans.admin_id AND ur.role = 'admin'
    WHERE ans.notify_on_new_visit = true
      AND (NEW.user_id IS NULL OR ans.admin_id != NEW.user_id)
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