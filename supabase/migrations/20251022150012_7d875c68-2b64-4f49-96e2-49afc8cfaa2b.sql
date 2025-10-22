-- Fix security warnings for mutable search paths

-- First, drop and recreate the functions with proper search_path settings

-- Fix update_cancellation_stats function
DROP FUNCTION IF EXISTS public.update_cancellation_stats(uuid, text);
CREATE OR REPLACE FUNCTION public.update_cancellation_stats(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_90d_start TIMESTAMPTZ := NOW() - INTERVAL '90 days';
  v_lifetime_committed INT;
  v_lifetime_cancels NUMERIC;
  v_90d_committed INT;
  v_90d_cancels NUMERIC;
  v_rate_90d NUMERIC := 0;
  v_rate_lifetime NUMERIC := 0;
  v_badge_tier TEXT := 'green';
  v_worst_rate NUMERIC := 0;
BEGIN
  IF p_role = 'rider' THEN
    SELECT 
      COUNT(*) FILTER (WHERE status IN ('assigned', 'completed', 'cancelled') AND assigned_driver_id IS NOT NULL),
      COALESCE(SUM(c.weight), 0)
    INTO v_lifetime_committed, v_lifetime_cancels
    FROM ride_requests rr
    LEFT JOIN cancellations c ON c.trip_id = rr.id AND c.user_id = p_user_id AND c.role = 'rider' AND c.is_chargeable = true
    WHERE rr.rider_id = p_user_id;
    
    SELECT 
      COUNT(*) FILTER (WHERE status IN ('assigned', 'completed', 'cancelled') AND assigned_driver_id IS NOT NULL),
      COALESCE(SUM(c.weight), 0)
    INTO v_90d_committed, v_90d_cancels
    FROM ride_requests rr
    LEFT JOIN cancellations c ON c.trip_id = rr.id AND c.user_id = p_user_id AND c.role = 'rider' AND c.is_chargeable = true AND c.timestamp >= v_90d_start
    WHERE rr.rider_id = p_user_id AND rr.created_at >= v_90d_start;
  ELSE
    SELECT 
      COUNT(*) FILTER (WHERE status IN ('assigned', 'completed', 'cancelled')),
      COALESCE(SUM(c.weight), 0)
    INTO v_lifetime_committed, v_lifetime_cancels
    FROM ride_requests rr
    LEFT JOIN cancellations c ON c.trip_id = rr.id AND c.user_id = p_user_id AND c.role = 'driver' AND c.is_chargeable = true
    WHERE rr.assigned_driver_id = p_user_id;
    
    SELECT 
      COUNT(*) FILTER (WHERE status IN ('assigned', 'completed', 'cancelled')),
      COALESCE(SUM(c.weight), 0)
    INTO v_90d_committed, v_90d_cancels
    FROM ride_requests rr
    LEFT JOIN cancellations c ON c.trip_id = rr.id AND c.user_id = p_user_id AND c.role = 'driver' AND c.is_chargeable = true AND c.timestamp >= v_90d_start
    WHERE rr.assigned_driver_id = p_user_id AND rr.created_at >= v_90d_start;
  END IF;
  
  IF v_lifetime_committed > 0 THEN
    v_rate_lifetime := (v_lifetime_cancels / v_lifetime_committed) * 100;
  END IF;
  
  IF v_90d_committed > 0 THEN
    v_rate_90d := (v_90d_cancels / v_90d_committed) * 100;
  END IF;
  
  INSERT INTO cancellation_stats (
    user_id,
    rider_total_committed, rider_cancels_chargeable,
    rider_90d_committed, rider_90d_cancels,
    rider_lifetime_committed, rider_lifetime_cancels,
    rider_rate_90d, rider_rate_lifetime,
    driver_total_committed, driver_cancels_chargeable,
    driver_90d_committed, driver_90d_cancels,
    driver_lifetime_committed, driver_lifetime_cancels,
    driver_rate_90d, driver_rate_lifetime
  )
  VALUES (
    p_user_id,
    CASE WHEN p_role = 'rider' THEN v_lifetime_committed ELSE 0 END,
    CASE WHEN p_role = 'rider' THEN v_lifetime_cancels ELSE 0 END,
    CASE WHEN p_role = 'rider' THEN v_90d_committed ELSE 0 END,
    CASE WHEN p_role = 'rider' THEN v_90d_cancels ELSE 0 END,
    CASE WHEN p_role = 'rider' THEN v_lifetime_committed ELSE 0 END,
    CASE WHEN p_role = 'rider' THEN v_lifetime_cancels ELSE 0 END,
    CASE WHEN p_role = 'rider' THEN v_rate_90d ELSE 0 END,
    CASE WHEN p_role = 'rider' THEN v_rate_lifetime ELSE 0 END,
    CASE WHEN p_role = 'driver' THEN v_lifetime_committed ELSE 0 END,
    CASE WHEN p_role = 'driver' THEN v_lifetime_cancels ELSE 0 END,
    CASE WHEN p_role = 'driver' THEN v_90d_committed ELSE 0 END,
    CASE WHEN p_role = 'driver' THEN v_90d_cancels ELSE 0 END,
    CASE WHEN p_role = 'driver' THEN v_lifetime_committed ELSE 0 END,
    CASE WHEN p_role = 'driver' THEN v_lifetime_cancels ELSE 0 END,
    CASE WHEN p_role = 'driver' THEN v_rate_90d ELSE 0 END,
    CASE WHEN p_role = 'driver' THEN v_rate_lifetime ELSE 0 END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    rider_total_committed = CASE WHEN p_role = 'rider' THEN v_lifetime_committed ELSE cancellation_stats.rider_total_committed END,
    rider_cancels_chargeable = CASE WHEN p_role = 'rider' THEN v_lifetime_cancels ELSE cancellation_stats.rider_cancels_chargeable END,
    rider_90d_committed = CASE WHEN p_role = 'rider' THEN v_90d_committed ELSE cancellation_stats.rider_90d_committed END,
    rider_90d_cancels = CASE WHEN p_role = 'rider' THEN v_90d_cancels ELSE cancellation_stats.rider_90d_cancels END,
    rider_lifetime_committed = CASE WHEN p_role = 'rider' THEN v_lifetime_committed ELSE cancellation_stats.rider_lifetime_committed END,
    rider_lifetime_cancels = CASE WHEN p_role = 'rider' THEN v_lifetime_cancels ELSE cancellation_stats.rider_lifetime_cancels END,
    rider_rate_90d = CASE WHEN p_role = 'rider' THEN v_rate_90d ELSE cancellation_stats.rider_rate_90d END,
    rider_rate_lifetime = CASE WHEN p_role = 'rider' THEN v_rate_lifetime ELSE cancellation_stats.rider_rate_lifetime END,
    driver_total_committed = CASE WHEN p_role = 'driver' THEN v_lifetime_committed ELSE cancellation_stats.driver_total_committed END,
    driver_cancels_chargeable = CASE WHEN p_role = 'driver' THEN v_lifetime_cancels ELSE cancellation_stats.driver_cancels_chargeable END,
    driver_90d_committed = CASE WHEN p_role = 'driver' THEN v_90d_committed ELSE cancellation_stats.driver_90d_committed END,
    driver_90d_cancels = CASE WHEN p_role = 'driver' THEN v_90d_cancels ELSE cancellation_stats.driver_90d_cancels END,
    driver_lifetime_committed = CASE WHEN p_role = 'driver' THEN v_lifetime_committed ELSE cancellation_stats.driver_lifetime_committed END,
    driver_lifetime_cancels = CASE WHEN p_role = 'driver' THEN v_lifetime_cancels ELSE cancellation_stats.driver_lifetime_cancels END,
    driver_rate_90d = CASE WHEN p_role = 'driver' THEN v_rate_90d ELSE cancellation_stats.driver_rate_90d END,
    driver_rate_lifetime = CASE WHEN p_role = 'driver' THEN v_rate_lifetime ELSE cancellation_stats.driver_rate_lifetime END,
    updated_at = NOW();
  
  SELECT 
    CASE 
      WHEN p_role = 'rider' THEN GREATEST(rider_rate_90d, rider_rate_lifetime)
      ELSE GREATEST(driver_rate_90d, driver_rate_lifetime)
    END
  INTO v_worst_rate
  FROM cancellation_stats
  WHERE user_id = p_user_id;
  
  v_badge_tier := CASE
    WHEN v_worst_rate > 15 THEN 'red'
    WHEN v_worst_rate >= 5 THEN 'yellow'
    ELSE 'green'
  END;
  
  UPDATE cancellation_stats
  SET badge_tier = v_badge_tier
  WHERE user_id = p_user_id;
END;
$$;

-- Fix calculate_cancel_weight function
DROP FUNCTION IF EXISTS public.calculate_cancel_weight(cancel_reason_code, timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION public.calculate_cancel_weight(
  p_reason_code cancel_reason_code,
  p_pickup_time timestamptz,
  p_cancelled_at timestamptz
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_minutes_to_pickup NUMERIC;
BEGIN
  IF p_reason_code = 'no_show' THEN
    RETURN 2.0;
  END IF;
  
  v_minutes_to_pickup := EXTRACT(EPOCH FROM (p_pickup_time - p_cancelled_at)) / 60;
  IF v_minutes_to_pickup <= 60 AND v_minutes_to_pickup >= 0 THEN
    RETURN 1.5;
  END IF;
  
  RETURN 1.0;
END;
$$;

-- Fix recalculate_all_cancellation_stats function
DROP FUNCTION IF EXISTS public.recalculate_all_cancellation_stats();
CREATE OR REPLACE FUNCTION public.recalculate_all_cancellation_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user RECORD;
BEGIN
  FOR v_user IN 
    SELECT DISTINCT rider_id as user_id FROM ride_requests WHERE assigned_driver_id IS NOT NULL
  LOOP
    PERFORM update_cancellation_stats(v_user.user_id, 'rider');
  END LOOP;
  
  FOR v_user IN 
    SELECT DISTINCT assigned_driver_id as user_id FROM ride_requests WHERE assigned_driver_id IS NOT NULL
  LOOP
    PERFORM update_cancellation_stats(v_user.user_id, 'driver');
  END LOOP;
END;
$$;