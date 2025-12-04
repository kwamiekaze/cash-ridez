-- Allow users to delete their own pending counter offers
CREATE POLICY "Users can delete their own pending offers"
ON public.counter_offers
FOR DELETE
USING (
  by_user_id = auth.uid() 
  AND status = 'pending'
);