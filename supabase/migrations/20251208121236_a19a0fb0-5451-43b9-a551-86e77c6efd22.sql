-- Create a public view for map presence data that anonymous users can query
-- This exposes only the fields needed for the public map display

CREATE OR REPLACE VIEW public.public_map_presence AS
SELECT 
  p.id as user_id,
  p.display_name,
  p.full_name,
  p.photo_url,
  p.current_lat,
  p.current_lng,
  p.location_updated_at,
  p.subscription_active,
  p.is_driver,
  p.is_rider,
  CASE 
    WHEN ur.role = 'admin' THEN true 
    ELSE false 
  END as is_admin,
  p.is_map_visible,
  p.map_history_hidden_from_public
FROM public.profiles p
LEFT JOIN public.user_roles ur ON p.id = ur.user_id AND ur.role = 'admin'
WHERE 
  p.current_lat IS NOT NULL 
  AND p.current_lng IS NOT NULL
  AND p.is_map_visible = true
  AND (p.map_history_hidden_from_public IS NULL OR p.map_history_hidden_from_public = false);

-- Grant SELECT access to anonymous users on this view
GRANT SELECT ON public.public_map_presence TO anon;
GRANT SELECT ON public.public_map_presence TO authenticated;