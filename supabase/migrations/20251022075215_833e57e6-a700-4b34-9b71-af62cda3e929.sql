-- Make cancellation_stats publicly readable
CREATE POLICY "Public can view cancellation stats"
ON public.cancellation_stats
FOR SELECT
TO public
USING (true);