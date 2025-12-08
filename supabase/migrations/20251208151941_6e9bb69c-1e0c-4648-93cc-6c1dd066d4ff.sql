-- 1. Update the public_map_presence view to treat NULL is_map_visible as visible
-- This ensures users with NULL visibility are shown (backwards compatibility)
DROP VIEW IF EXISTS public_map_presence;

CREATE VIEW public_map_presence AS
SELECT 
  p.id AS user_id,
  p.display_name,
  p.full_name,
  p.photo_url,
  p.current_lat,
  p.current_lng,
  p.location_updated_at,
  p.subscription_active,
  p.is_driver,
  p.is_rider,
  CASE WHEN ur.role = 'admin' THEN true ELSE false END AS is_admin,
  p.is_map_visible,
  p.map_history_hidden_from_public
FROM profiles p
LEFT JOIN user_roles ur ON p.id = ur.user_id AND ur.role = 'admin'
WHERE 
  p.current_lat IS NOT NULL 
  AND p.current_lng IS NOT NULL
  -- Treat NULL as visible (is_map_visible = true OR is_map_visible IS NULL)
  AND (p.is_map_visible = true OR p.is_map_visible IS NULL)
  -- Exclude users with hidden history
  AND (p.map_history_hidden_from_public IS NULL OR p.map_history_hidden_from_public = false);

-- 2. Ensure is_map_visible defaults to TRUE for all new users
-- (column already has DEFAULT true, but let's be explicit in case it was changed)
ALTER TABLE profiles ALTER COLUMN is_map_visible SET DEFAULT true;

-- 3. BACKFILL: Set is_map_visible = true for any user where:
--    a) is_map_visible IS NULL
--    b) is_map_visible = false AND subscription_active = false (non-subscribers cannot be invisible)
UPDATE profiles
SET is_map_visible = true
WHERE is_map_visible IS NULL;

UPDATE profiles
SET is_map_visible = true
WHERE is_map_visible = false 
  AND (subscription_active = false OR subscription_active IS NULL)
  -- Exclude admins from this backfill (they can toggle regardless of subscription)
  AND id NOT IN (SELECT user_id FROM user_roles WHERE role = 'admin');

-- Grant select on the view to anon/authenticated for public access
GRANT SELECT ON public_map_presence TO anon;
GRANT SELECT ON public_map_presence TO authenticated;