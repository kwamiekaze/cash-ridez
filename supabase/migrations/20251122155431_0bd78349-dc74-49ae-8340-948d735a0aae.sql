-- Create calls table for masked calling system
CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.ride_requests(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  initiated_by_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'ringing', 'in_progress', 'completed', 'failed', 'no_answer', 'canceled')),
  twilio_call_sid_rider TEXT,
  twilio_call_sid_driver TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_calls_trip_id ON public.calls(trip_id);
CREATE INDEX idx_calls_rider_id ON public.calls(rider_id);
CREATE INDEX idx_calls_driver_id ON public.calls(driver_id);

-- Enable RLS
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Riders and drivers can view their own call records
CREATE POLICY "Participants can view their calls"
  ON public.calls
  FOR SELECT
  USING (
    auth.uid() = rider_id OR 
    auth.uid() = driver_id
  );

-- RLS Policy: Admins can view all calls
CREATE POLICY "Admins can view all calls"
  ON public.calls
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policy: System can insert calls
CREATE POLICY "System can insert calls"
  ON public.calls
  FOR INSERT
  WITH CHECK (true);

-- RLS Policy: System can update calls
CREATE POLICY "System can update calls"
  ON public.calls
  FOR UPDATE
  USING (true);

-- Trigger to update updated_at
CREATE TRIGGER update_calls_updated_at
  BEFORE UPDATE ON public.calls
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();