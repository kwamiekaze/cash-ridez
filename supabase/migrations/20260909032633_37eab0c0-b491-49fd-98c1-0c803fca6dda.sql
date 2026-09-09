CREATE OR REPLACE FUNCTION public.get_last_visit_per_user()
RETURNS TABLE(user_id uuid, last_visit timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pv.user_id, max(pv.created_at) AS last_visit
  FROM public.page_views pv
  WHERE pv.user_id IS NOT NULL
    AND (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role))
  GROUP BY pv.user_id
$$;

REVOKE ALL ON FUNCTION public.get_last_visit_per_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_last_visit_per_user() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_last_visit_per_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_last_visit_per_user() TO service_role;