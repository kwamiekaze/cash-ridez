CREATE OR REPLACE FUNCTION public.insert_new_trip_notifications(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  -- Service role only: this is called by the notification worker.
  PERFORM public.assert_service_role();

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN 0;
  END IF;

  WITH candidate AS (
    SELECT
      (r->>'user_id')::uuid          AS user_id,
      (r->>'related_user_id')::uuid  AS related_user_id,
      (r->>'related_ride_id')::uuid  AS related_ride_id,
      left(coalesce(r->>'title', 'New Trip Request Near You'), 200)  AS title,
      left(coalesce(r->>'message', ''), 1000)                        AS message,
      left(coalesce(r->>'link', ''), 500)                            AS link
    FROM jsonb_array_elements(p_rows) AS r
    WHERE r ? 'user_id'
      AND r ? 'related_ride_id'
      AND (r->>'user_id') IS NOT NULL
      AND (r->>'related_ride_id') IS NOT NULL
  ), ins AS (
    INSERT INTO public.notifications
      (user_id, related_user_id, related_ride_id, type, title, message, link)
    SELECT user_id, related_user_id, related_ride_id, 'new_trip', title, message, nullif(link, '')
    FROM candidate
    ON CONFLICT (user_id, related_ride_id, type)
      WHERE type = 'new_trip' AND related_ride_id IS NOT NULL
      DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_new_trip_notifications(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_new_trip_notifications(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_new_trip_notifications(jsonb) TO service_role;