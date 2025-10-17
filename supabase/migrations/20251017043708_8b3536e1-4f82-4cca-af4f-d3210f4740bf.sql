-- Grant admin role to user
INSERT INTO public.user_roles (user_id, role)
VALUES ('f49510e0-b807-4820-9f0b-13732f2e53b3', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Mark user as verified
UPDATE public.profiles
SET 
  is_verified = true,
  verification_status = 'approved',
  verification_reviewed_at = now()
WHERE id = 'f49510e0-b807-4820-9f0b-13732f2e53b3';