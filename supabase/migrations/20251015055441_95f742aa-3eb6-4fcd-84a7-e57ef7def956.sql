-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create user roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'driver', 'rider');

-- Create ride request status enum
CREATE TYPE public.ride_status AS ENUM ('open', 'assigned', 'completed', 'cancelled');

-- Create verification status enum
CREATE TYPE public.verification_status AS ENUM ('pending', 'approved', 'rejected');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  photo_url TEXT,
  is_rider BOOLEAN DEFAULT false,
  is_driver BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  verification_status verification_status DEFAULT 'pending',
  id_image_url TEXT,
  verification_submitted_at TIMESTAMP WITH TIME ZONE,
  verification_reviewed_at TIMESTAMP WITH TIME ZONE,
  verification_reviewer_id UUID REFERENCES auth.users(id),
  verification_notes TEXT,
  rider_rating_avg DECIMAL(3,2) DEFAULT 0.00,
  rider_rating_count INTEGER DEFAULT 0,
  driver_rating_avg DECIMAL(3,2) DEFAULT 0.00,
  driver_rating_count INTEGER DEFAULT 0,
  active_assigned_ride_id UUID,
  blocked BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Create ride_requests table
CREATE TABLE public.ride_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status ride_status DEFAULT 'open',
  rider_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pickup_address TEXT NOT NULL,
  pickup_lat DECIMAL(10, 8) NOT NULL,
  pickup_lng DECIMAL(11, 8) NOT NULL,
  pickup_zip TEXT NOT NULL,
  dropoff_address TEXT NOT NULL,
  dropoff_lat DECIMAL(10, 8) NOT NULL,
  dropoff_lng DECIMAL(11, 8) NOT NULL,
  dropoff_zip TEXT NOT NULL,
  pickup_time TIMESTAMP WITH TIME ZONE NOT NULL,
  rider_note TEXT,
  rider_note_image_url TEXT,
  assigned_driver_id UUID REFERENCES auth.users(id),
  eta_minutes INTEGER,
  price_offer DECIMAL(10, 2),
  search_keywords TEXT[],
  cancelled_by TEXT,
  cancel_reason_rider TEXT,
  cancel_reason_driver TEXT,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  rider_completed BOOLEAN DEFAULT false,
  driver_completed BOOLEAN DEFAULT false,
  rider_rating INTEGER,
  driver_rating INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create counter_offers table
CREATE TABLE public.counter_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_request_id UUID NOT NULL REFERENCES public.ride_requests(id) ON DELETE CASCADE,
  by_user_id UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create messages table for ride chat
CREATE TABLE public.ride_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_request_id UUID NOT NULL REFERENCES public.ride_requests(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  text TEXT NOT NULL,
  attachment_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create support_tickets table
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_collection TEXT,
  target_id UUID,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counter_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Profiles RLS policies
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- User roles policies
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Ride requests policies
CREATE POLICY "Verified users can view open requests"
  ON public.ride_requests FOR SELECT
  USING (
    status = 'open' AND 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_verified = true)
  );

CREATE POLICY "Riders can view their own requests"
  ON public.ride_requests FOR SELECT
  USING (rider_id = auth.uid());

CREATE POLICY "Assigned drivers can view their assigned rides"
  ON public.ride_requests FOR SELECT
  USING (assigned_driver_id = auth.uid());

CREATE POLICY "Admins can view all requests"
  ON public.ride_requests FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Verified riders can create requests"
  ON public.ride_requests FOR INSERT
  WITH CHECK (
    auth.uid() = rider_id AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_verified = true AND is_rider = true)
  );

CREATE POLICY "Riders can update own open requests"
  ON public.ride_requests FOR UPDATE
  USING (rider_id = auth.uid() AND status = 'open');

CREATE POLICY "Assigned drivers can update their rides"
  ON public.ride_requests FOR UPDATE
  USING (assigned_driver_id = auth.uid());

-- Counter offers policies
CREATE POLICY "Participants can view offers"
  ON public.counter_offers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ride_requests 
      WHERE id = ride_request_id 
      AND (rider_id = auth.uid() OR assigned_driver_id = auth.uid())
    )
  );

CREATE POLICY "Participants can create offers"
  ON public.counter_offers FOR INSERT
  WITH CHECK (
    by_user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.ride_requests 
      WHERE id = ride_request_id 
      AND (rider_id = auth.uid() OR assigned_driver_id = auth.uid())
    )
  );

-- Ride messages policies
CREATE POLICY "Participants can view messages"
  ON public.ride_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ride_requests 
      WHERE id = ride_request_id 
      AND (rider_id = auth.uid() OR assigned_driver_id = auth.uid())
    ) OR
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Participants can send messages"
  ON public.ride_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.ride_requests 
      WHERE id = ride_request_id 
      AND (rider_id = auth.uid() OR assigned_driver_id = auth.uid())
    )
  );

-- Support tickets policies
CREATE POLICY "Users can view own tickets"
  ON public.support_tickets FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all tickets"
  ON public.support_tickets FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create tickets"
  ON public.support_tickets FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update tickets"
  ON public.support_tickets FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Audit logs policies (admin only)
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can create audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Add updated_at triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ride_requests_updated_at
  BEFORE UPDATE ON public.ride_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_ride_requests_status ON public.ride_requests(status);
CREATE INDEX idx_ride_requests_rider ON public.ride_requests(rider_id);
CREATE INDEX idx_ride_requests_driver ON public.ride_requests(assigned_driver_id);
CREATE INDEX idx_ride_requests_pickup_zip ON public.ride_requests(pickup_zip);
CREATE INDEX idx_ride_requests_created_at ON public.ride_requests(created_at DESC);
CREATE INDEX idx_profiles_verified ON public.profiles(is_verified);
CREATE INDEX idx_ride_messages_ride ON public.ride_messages(ride_request_id, created_at);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_messages;