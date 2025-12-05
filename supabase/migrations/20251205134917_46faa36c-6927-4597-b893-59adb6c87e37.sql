-- Add fare estimation columns to ride_requests
ALTER TABLE public.ride_requests 
ADD COLUMN IF NOT EXISTS estimated_competitor_fare_min numeric,
ADD COLUMN IF NOT EXISTS estimated_competitor_fare_max numeric,
ADD COLUMN IF NOT EXISTS estimated_competitor_fare_mid numeric,
ADD COLUMN IF NOT EXISTS estimated_competitor_driver_earnings numeric,
ADD COLUMN IF NOT EXISTS rider_savings_vs_competitor numeric,
ADD COLUMN IF NOT EXISTS driver_extra_vs_competitor numeric;

-- Add cumulative savings/earnings columns to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS total_driver_earnings numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_driver_extra_vs_competitor numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_rider_savings_vs_competitor numeric DEFAULT 0;

-- Create or replace function to update savings/earnings on trip completion
CREATE OR REPLACE FUNCTION public.update_trip_savings_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_competitor_mid numeric;
  v_competitor_driver_earn numeric;
  v_rider_savings numeric;
  v_driver_extra numeric;
  v_trip_price numeric;
BEGIN
  -- Only trigger when status changes to completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    v_trip_price := COALESCE(NEW.price_offer, 0);
    v_competitor_mid := COALESCE(NEW.estimated_competitor_fare_mid, 0);
    v_competitor_driver_earn := COALESCE(NEW.estimated_competitor_driver_earnings, 0);
    
    -- Calculate savings/extra earnings
    v_rider_savings := GREATEST(v_competitor_mid - v_trip_price, 0);
    v_driver_extra := GREATEST(v_trip_price - v_competitor_driver_earn, 0);
    
    -- Update the ride request with final calculated values
    UPDATE ride_requests
    SET rider_savings_vs_competitor = v_rider_savings,
        driver_extra_vs_competitor = v_driver_extra
    WHERE id = NEW.id;
    
    -- Update rider profile cumulative savings
    UPDATE profiles
    SET total_rider_savings_vs_competitor = COALESCE(total_rider_savings_vs_competitor, 0) + v_rider_savings
    WHERE id = NEW.rider_id;
    
    -- Update driver profile cumulative earnings
    IF NEW.assigned_driver_id IS NOT NULL THEN
      UPDATE profiles
      SET total_driver_earnings = COALESCE(total_driver_earnings, 0) + v_trip_price,
          total_driver_extra_vs_competitor = COALESCE(total_driver_extra_vs_competitor, 0) + v_driver_extra
      WHERE id = NEW.assigned_driver_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for updating savings on completion
DROP TRIGGER IF EXISTS update_trip_savings_trigger ON ride_requests;
CREATE TRIGGER update_trip_savings_trigger
  AFTER UPDATE ON ride_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_trip_savings_on_completion();