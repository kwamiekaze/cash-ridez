-- Add paused field to profiles for admin account management
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS paused BOOLEAN DEFAULT false;

-- Add comment explaining contact privacy
COMMENT ON COLUMN public.profiles.phone_number IS 'Contact info only visible to assigned driver on accepted trips';

-- Create function to check if user can view contact info
CREATE OR REPLACE FUNCTION public.can_view_contact_info(_viewer_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  -- User can view own contact info
  SELECT _viewer_id = _profile_id
  OR
  -- Admin can view all contact info
  has_role(_viewer_id, 'admin'::app_role)
  OR
  -- Assigned driver can view rider contact info, and rider can view assigned driver contact info
  EXISTS (
    SELECT 1
    FROM ride_requests
    WHERE status = 'assigned'
    AND (
      (assigned_driver_id = _viewer_id AND rider_id = _profile_id)
      OR
      (rider_id = _viewer_id AND assigned_driver_id = _profile_id)
    )
  )
$$;