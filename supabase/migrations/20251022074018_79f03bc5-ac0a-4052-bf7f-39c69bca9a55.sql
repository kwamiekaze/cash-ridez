-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_trip_cancelled ON ride_requests;

-- Create enum for cancel reason codes
CREATE TYPE cancel_reason_code AS ENUM (
  'rider_changed_mind',
  'driver_unavailable', 
  'price_dispute',
  'no_show',
  'late',
  'duplicate_request',
  'safety',
  'weather',
  'system_timeout',
  'other'
);

-- Add cancel_reason_code to ride_requests
ALTER TABLE ride_requests 
ADD COLUMN IF NOT EXISTS cancel_reason_code cancel_reason_code;

-- Create cancellations event log (append-only)
CREATE TABLE IF NOT EXISTS cancellations (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES ride_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('rider', 'driver')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason_code cancel_reason_code NOT NULL,
  is_chargeable BOOLEAN NOT NULL DEFAULT true,
  weight NUMERIC NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cancellations_user_id ON cancellations(user_id);
CREATE INDEX IF NOT EXISTS idx_cancellations_trip_id ON cancellations(trip_id);
CREATE INDEX IF NOT EXISTS idx_cancellations_timestamp ON cancellations(timestamp);

ALTER TABLE cancellations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own cancellations" ON cancellations;
CREATE POLICY "Users can view own cancellations"
  ON cancellations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all cancellations" ON cancellations;
CREATE POLICY "Admins can view all cancellations"
  ON cancellations FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "System can insert cancellations" ON cancellations;
CREATE POLICY "System can insert cancellations"
  ON cancellations FOR INSERT
  WITH CHECK (true);

-- Create cancellation_stats (denormalized per-user stats)
CREATE TABLE IF NOT EXISTS cancellation_stats (
  user_id UUID PRIMARY KEY,
  rider_total_committed INT NOT NULL DEFAULT 0,
  rider_cancels_chargeable INT NOT NULL DEFAULT 0,
  rider_90d_committed INT NOT NULL DEFAULT 0,
  rider_90d_cancels NUMERIC NOT NULL DEFAULT 0,
  rider_lifetime_committed INT NOT NULL DEFAULT 0,
  rider_lifetime_cancels NUMERIC NOT NULL DEFAULT 0,
  rider_rate_90d NUMERIC NOT NULL DEFAULT 0,
  rider_rate_lifetime NUMERIC NOT NULL DEFAULT 0,
  driver_total_committed INT NOT NULL DEFAULT 0,
  driver_cancels_chargeable INT NOT NULL DEFAULT 0,
  driver_90d_committed INT NOT NULL DEFAULT 0,
  driver_90d_cancels NUMERIC NOT NULL DEFAULT 0,
  driver_lifetime_committed INT NOT NULL DEFAULT 0,
  driver_lifetime_cancels NUMERIC NOT NULL DEFAULT 0,
  driver_rate_90d NUMERIC NOT NULL DEFAULT 0,
  driver_rate_lifetime NUMERIC NOT NULL DEFAULT 0,
  badge_tier TEXT NOT NULL DEFAULT 'green' CHECK (badge_tier IN ('green', 'yellow', 'red')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cancellation_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own stats" ON cancellation_stats;
CREATE POLICY "Users can view own stats"
  ON cancellation_stats FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "All verified users can view other users stats" ON cancellation_stats;
CREATE POLICY "All verified users can view other users stats"
  ON cancellation_stats FOR SELECT
  USING (is_verified_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all stats" ON cancellation_stats;
CREATE POLICY "Admins can view all stats"
  ON cancellation_stats FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "System can update stats" ON cancellation_stats;
CREATE POLICY "System can update stats"
  ON cancellation_stats FOR ALL
  USING (true)
  WITH CHECK (true);

-- Function to determine chargeability
CREATE OR REPLACE FUNCTION is_cancel_chargeable(
  p_trip_id UUID,
  p_cancelled_by TEXT,
  p_reason_code cancel_reason_code,
  p_accepted_at TIMESTAMPTZ,
  p_pickup_time TIMESTAMPTZ,
  p_cancelled_at TIMESTAMPTZ
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grace_minutes INT := 2;
  v_minutes_since_accept NUMERIC;
BEGIN
  IF p_reason_code IS NULL THEN
    RETURN true;
  END IF;
  
  IF p_reason_code = 'system_timeout' THEN
    RETURN false;
  END IF;
  
  IF p_reason_code IN ('safety', 'weather') THEN
    RETURN false;
  END IF;
  
  IF p_reason_code = 'duplicate_request' AND p_cancelled_by = 'rider' THEN
    RETURN false;
  END IF;
  
  IF p_accepted_at IS NOT NULL THEN
    v_minutes_since_accept := EXTRACT(EPOCH FROM (p_cancelled_at - p_accepted_at)) / 60;
    IF v_minutes_since_accept <= v_grace_minutes THEN
      RETURN false;
    END IF;
  END IF;
  
  RETURN true;
END;
$$;

-- Function to calculate cancel weight
CREATE OR REPLACE FUNCTION calculate_cancel_weight(
  p_reason_code cancel_reason_code,
  p_pickup_time TIMESTAMPTZ,
  p_cancelled_at TIMESTAMPTZ
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Function to update cancellation stats
CREATE OR REPLACE FUNCTION update_cancellation_stats(p_user_id UUID, p_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Trigger function to handle trip cancellation
CREATE OR REPLACE FUNCTION handle_trip_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_is_chargeable BOOLEAN;
  v_weight NUMERIC;
BEGIN
  IF NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status != 'cancelled') THEN
    IF NEW.cancelled_by = 'rider' THEN
      v_user_id := NEW.rider_id;
      v_role := 'rider';
    ELSIF NEW.cancelled_by = 'driver' AND NEW.assigned_driver_id IS NOT NULL THEN
      v_user_id := NEW.assigned_driver_id;
      v_role := 'driver';
    ELSE
      RETURN NEW;
    END IF;
    
    v_is_chargeable := is_cancel_chargeable(
      NEW.id,
      NEW.cancelled_by,
      NEW.cancel_reason_code,
      CASE WHEN NEW.status = 'assigned' OR OLD.status = 'assigned' THEN OLD.updated_at ELSE NULL END,
      NEW.pickup_time,
      NEW.cancelled_at
    );
    
    v_weight := calculate_cancel_weight(
      COALESCE(NEW.cancel_reason_code, 'other'),
      NEW.pickup_time,
      NEW.cancelled_at
    );
    
    INSERT INTO cancellations (
      trip_id, user_id, role, reason_code,
      is_chargeable, weight, timestamp
    ) VALUES (
      NEW.id, v_user_id, v_role,
      COALESCE(NEW.cancel_reason_code, 'other'),
      v_is_chargeable, v_weight, NEW.cancelled_at
    );
    
    IF v_is_chargeable THEN
      PERFORM update_cancellation_stats(v_user_id, v_role);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_trip_cancelled
  AFTER UPDATE ON ride_requests
  FOR EACH ROW
  EXECUTE FUNCTION handle_trip_cancellation();

CREATE OR REPLACE FUNCTION recalculate_all_cancellation_stats()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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