-- Drop the existing policy
DROP POLICY IF EXISTS "Verified users can view published system messages" ON public.system_messages;

-- Create updated policy that checks user's active role against target_roles
CREATE POLICY "Verified users can view published system messages for their role"
ON public.system_messages
FOR SELECT
TO authenticated
USING (
  is_published = true 
  AND is_verified_user(auth.uid())
  AND (
    -- Check if user's active_role is in the target_roles array
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.active_role = ANY(system_messages.target_roles)
        OR has_role(auth.uid(), 'admin'::app_role)
      )
    )
  )
);