ALTER TABLE public.admin_email_campaign_recipients
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS retry_after TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_email_recipients_campaign_status
  ON public.admin_email_campaign_recipients(campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_page_views_user_created
  ON public.page_views(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.select_recent_active_drivers(p_limit INTEGER)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  first_name TEXT,
  last_active_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH activity AS (
    SELECT pv.user_id, MAX(pv.created_at) AS last_active_at
    FROM public.page_views pv
    WHERE pv.user_id IS NOT NULL
    GROUP BY pv.user_id
  ),
  eligible AS (
    SELECT
      p.id AS user_id,
      lower(btrim(p.email)) AS email,
      NULLIF(split_part(btrim(COALESCE(NULLIF(btrim(p.full_name), ''), p.display_name, '')), ' ', 1), '') AS first_name,
      a.last_active_at
    FROM public.profiles p
    JOIN activity a ON a.user_id = p.id
    WHERE p.is_driver = TRUE
      AND COALESCE(p.blocked, FALSE) = FALSE
      AND p.verification_status = 'approved'
      AND p.email IS NOT NULL
      AND btrim(p.email) <> ''
      AND btrim(p.email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  deduped AS (
    SELECT DISTINCT ON (email) user_id, email, first_name, last_active_at
    FROM eligible
    ORDER BY email, last_active_at DESC, user_id
  )
  SELECT user_id, email, first_name, last_active_at
  FROM deduped
  ORDER BY last_active_at DESC, user_id
  LIMIT GREATEST(0, COALESCE(p_limit, 0));
$$;

REVOKE ALL ON FUNCTION public.select_recent_active_drivers(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.select_recent_active_drivers(INTEGER) TO service_role;