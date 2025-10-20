-- Add admin_locked_fields column to profiles to track which fields admins have locked
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS admin_locked_fields TEXT[] DEFAULT '{}';

-- Add comment to explain the column
COMMENT ON COLUMN public.profiles.admin_locked_fields IS 'Array of field names that have been locked by admins and cannot be edited by users';

-- Add trigger to prevent users from editing admin-locked fields
CREATE OR REPLACE FUNCTION public.prevent_locked_field_edits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only apply to non-admin users
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    -- Check if any admin-locked fields are being modified
    IF OLD.admin_locked_fields IS NOT NULL AND array_length(OLD.admin_locked_fields, 1) > 0 THEN
      -- Check full_name
      IF 'full_name' = ANY(OLD.admin_locked_fields) AND (NEW.full_name IS DISTINCT FROM OLD.full_name) THEN
        RAISE EXCEPTION 'The full_name field has been locked by an administrator. Please contact support for assistance.';
      END IF;
      
      -- Check phone_number
      IF 'phone_number' = ANY(OLD.admin_locked_fields) AND (NEW.phone_number IS DISTINCT FROM OLD.phone_number) THEN
        RAISE EXCEPTION 'The phone_number field has been locked by an administrator. Please contact support for assistance.';
      END IF;
      
      -- Check bio
      IF 'bio' = ANY(OLD.admin_locked_fields) AND (NEW.bio IS DISTINCT FROM OLD.bio) THEN
        RAISE EXCEPTION 'The bio field has been locked by an administrator. Please contact support for assistance.';
      END IF;
      
      -- Check email
      IF 'email' = ANY(OLD.admin_locked_fields) AND (NEW.email IS DISTINCT FROM OLD.email) THEN
        RAISE EXCEPTION 'The email field has been locked by an administrator. Please contact support for assistance.';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to enforce locked field protection
DROP TRIGGER IF EXISTS prevent_locked_field_edits_trigger ON public.profiles;
CREATE TRIGGER prevent_locked_field_edits_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_field_edits();