-- Create community_messages table for all verified users
CREATE TABLE IF NOT EXISTS public.community_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

-- Allow all verified users to read messages from last 24 hours
CREATE POLICY "Verified users can read recent messages"
ON public.community_messages
FOR SELECT
TO authenticated
USING (
  created_at > (now() - interval '24 hours')
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_verified = true
  )
);

-- Allow verified users to insert their own messages
CREATE POLICY "Verified users can insert messages"
ON public.community_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_verified = true
  )
);

-- Allow users to delete their own messages
CREATE POLICY "Users can delete own messages"
ON public.community_messages
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Admin can delete any message
CREATE POLICY "Admins can delete any message"
ON public.community_messages
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Create index for performance
CREATE INDEX idx_community_messages_created_at ON public.community_messages(created_at DESC);
CREATE INDEX idx_community_messages_user_id ON public.community_messages(user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_community_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_community_messages_timestamp
BEFORE UPDATE ON public.community_messages
FOR EACH ROW
EXECUTE FUNCTION update_community_messages_updated_at();