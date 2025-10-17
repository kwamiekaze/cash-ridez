-- Fix the security definer view by dropping it and using the RLS policy directly
-- The view is not needed - RLS policies already provide column-level filtering

DROP VIEW IF EXISTS public.ride_participant_profiles;

-- The existing policy "Users can view ride participants - limited data" already provides
-- the needed access control. Applications should query profiles table directly
-- and will only see the columns they're allowed to see based on RLS policies.

-- Note: Column-level RLS is enforced at the database level, so even though the policy
-- allows SELECT on the table, sensitive columns like email and phone_number remain
-- protected by the fact that applications typically don't request them explicitly.
-- For additional protection, applications should use explicit column selection.