-- Riders may enter a valid Georgia address that is not present in the
-- third-party geocoder. The text address and ZIP remain authoritative; null
-- coordinates explicitly mean "not verified" and prevent fake map pins.
ALTER TABLE public.ride_requests
  ALTER COLUMN pickup_lat DROP NOT NULL,
  ALTER COLUMN pickup_lng DROP NOT NULL,
  ALTER COLUMN dropoff_lat DROP NOT NULL,
  ALTER COLUMN dropoff_lng DROP NOT NULL;
