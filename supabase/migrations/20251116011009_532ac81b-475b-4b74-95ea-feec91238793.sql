-- Create system_messages table for admin broadcasts
CREATE TABLE IF NOT EXISTS public.system_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_roles TEXT[] NOT NULL DEFAULT ARRAY['rider', 'driver', 'admin'],
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ
);

-- Enable RLS on system_messages
ALTER TABLE public.system_messages ENABLE ROW LEVEL SECURITY;

-- Admins can manage system messages
CREATE POLICY "Admins can manage system messages"
ON public.system_messages
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- All verified users can view published system messages
CREATE POLICY "Verified users can view published system messages"
ON public.system_messages
FOR SELECT
USING (is_published = true AND public.is_verified_user(auth.uid()));

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_system_messages_published 
ON public.system_messages(published_at DESC) 
WHERE is_published = true;

-- Add trigger for updated_at
CREATE TRIGGER update_system_messages_updated_at
  BEFORE UPDATE ON public.system_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create chat_rooms table for admin-managed chat rooms
CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  allowed_roles TEXT[] NOT NULL DEFAULT ARRAY['rider', 'driver', 'admin'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_participants INTEGER,
  is_public BOOLEAN NOT NULL DEFAULT false
);

-- Enable RLS on chat_rooms
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

-- Admins can manage chat rooms
CREATE POLICY "Admins can manage chat rooms"
ON public.chat_rooms
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Users can view chat rooms they have access to
CREATE POLICY "Users can view accessible chat rooms"
ON public.chat_rooms
FOR SELECT
USING (
  is_active = true 
  AND public.is_verified_user(auth.uid())
  AND (
    is_public = true
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND (
        p.active_role = ANY(allowed_roles)
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
    )
  )
);

-- Create chat_room_messages table
CREATE TABLE IF NOT EXISTS public.chat_room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL
);

-- Enable RLS on chat_room_messages
ALTER TABLE public.chat_room_messages ENABLE ROW LEVEL SECURITY;

-- Users can view messages in rooms they have access to
CREATE POLICY "Users can view accessible room messages"
ON public.chat_room_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chat_rooms cr
    WHERE cr.id = room_id
    AND cr.is_active = true
    AND public.is_verified_user(auth.uid())
    AND (
      cr.is_public = true
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND (
          p.active_role = ANY(cr.allowed_roles)
          OR public.has_role(auth.uid(), 'admin'::app_role)
        )
      )
    )
  )
);

-- Users can post messages in rooms they have access to
CREATE POLICY "Users can post in accessible rooms"
ON public.chat_room_messages
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.chat_rooms cr
    WHERE cr.id = room_id
    AND cr.is_active = true
    AND public.is_verified_user(auth.uid())
    AND (
      cr.is_public = true
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND (
          p.active_role = ANY(cr.allowed_roles)
          OR public.has_role(auth.uid(), 'admin'::app_role)
        )
      )
    )
  )
);

-- Admins can delete any message
CREATE POLICY "Admins can delete any room message"
ON public.chat_room_messages
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_rooms_active ON public.chat_rooms(is_active);
CREATE INDEX IF NOT EXISTS idx_chat_room_messages_room_created ON public.chat_room_messages(room_id, created_at DESC);