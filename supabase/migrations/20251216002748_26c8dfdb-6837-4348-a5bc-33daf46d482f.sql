-- Ensure all users are visible on the map by default
-- Users can still toggle invisible if they're ID-verified

-- Set all NULL values to true (visible)
UPDATE profiles
SET is_map_visible = true
WHERE is_map_visible IS NULL;

-- Set all false values to true for users who haven't explicitly toggled
-- (Admins and verified users who want to be invisible can toggle again)
UPDATE profiles
SET is_map_visible = true
WHERE is_map_visible = false;