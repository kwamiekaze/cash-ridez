-- Lock down community chat to admins only
-- Drop existing INSERT policies for non-admins
DROP POLICY IF EXISTS "Users can insert their own messages" ON public.community_messages;
DROP POLICY IF EXISTS "Verified users can insert messages" ON public.community_messages;

-- Create new INSERT policy: Only admins can post to community chat
CREATE POLICY "Only admins can post to community chat"
ON public.community_messages
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
);

-- Mark all community chat notifications as read (one-time cleanup)
UPDATE public.notifications
SET read = true
WHERE type = 'community_message' AND read = false;