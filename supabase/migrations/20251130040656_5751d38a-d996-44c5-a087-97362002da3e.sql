-- Add RLS policy to allow all verified users to view each other's basic public info (name, photo)
-- This enables community chat to display full names and photos for all users
CREATE POLICY "Verified users can view basic public profile info"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  is_verified_user(auth.uid()) 
  AND is_verified_user(id)
);