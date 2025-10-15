-- Add missing fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone_number text,
ADD COLUMN IF NOT EXISTS bio text,
ADD COLUMN IF NOT EXISTS full_name text;

-- Update the two test users to be verified and admins
UPDATE public.profiles 
SET is_verified = true, 
    verification_status = 'approved'
WHERE email IN ('kwamiekaze@gmail.com', 'Kwamie.luxor@gmail.com');

-- Grant admin role to test users
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM public.profiles
WHERE email IN ('kwamiekaze@gmail.com', 'Kwamie.luxor@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;