-- Add cancellation feedback table and allow rating updates after completion
CREATE TABLE IF NOT EXISTS public.cancellation_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL,
  from_user_id uuid NOT NULL,
  about_user_id uuid NOT NULL,
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cancellation_feedback ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cancellation_feedback_trip ON public.cancellation_feedback(trip_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_feedback_from_user ON public.cancellation_feedback(from_user_id);

DROP POLICY IF EXISTS "Participants can insert feedback" ON public.cancellation_feedback;
CREATE POLICY "Participants can insert feedback"
  ON public.cancellation_feedback
  FOR INSERT
  WITH CHECK (
    from_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.ride_requests rr
      WHERE rr.id = trip_id AND (rr.rider_id = auth.uid() OR rr.assigned_driver_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users view own feedback" ON public.cancellation_feedback;
CREATE POLICY "Users view own feedback"
  ON public.cancellation_feedback
  FOR SELECT
  USING (from_user_id = auth.uid());

DROP POLICY IF EXISTS "Admins view all feedback" ON public.cancellation_feedback;
CREATE POLICY "Admins view all feedback"
  ON public.cancellation_feedback
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));