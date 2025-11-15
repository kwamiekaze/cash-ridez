-- First, remove or update the active_role check constraint to allow admin
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_active_role_check;

-- Add updated constraint that allows rider, driver, and admin
ALTER TABLE profiles ADD CONSTRAINT profiles_active_role_check 
  CHECK (active_role IS NULL OR active_role IN ('rider', 'driver', 'admin'));

-- Now update the test accounts with proper roles and verification
DO $$
DECLARE
  kwamie_user_id uuid;
  rider_user_id uuid;
  driver_user_id uuid;
  admin_user_id uuid;
BEGIN
  -- Get kwamiekaze user ID
  SELECT id INTO kwamie_user_id FROM auth.users WHERE email = 'kwamiekaze@gmail.com';
  
  IF kwamie_user_id IS NOT NULL THEN
    -- Update profile
    UPDATE profiles SET 
      is_verified = true,
      verification_status = 'approved',
      verification_reviewed_at = now(),
      active_role = 'admin',
      role_set_at = now()
    WHERE id = kwamie_user_id;
    
    -- Ensure admin role exists
    INSERT INTO user_roles (user_id, role)
    VALUES (kwamie_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- Get rider@cashridez.com user ID
  SELECT id INTO rider_user_id FROM auth.users WHERE email = 'rider@cashridez.com';
  
  IF rider_user_id IS NOT NULL THEN
    -- Update profile for verified rider
    UPDATE profiles SET 
      is_verified = true,
      verification_status = 'approved',
      verification_reviewed_at = now(),
      active_role = 'rider',
      is_rider = true,
      role_set_at = now()
    WHERE id = rider_user_id;
    
    -- Ensure rider role exists
    INSERT INTO user_roles (user_id, role)
    VALUES (rider_user_id, 'rider')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- Get driver@cashridez.com user ID  
  SELECT id INTO driver_user_id FROM auth.users WHERE email = 'driver@cashridez.com';
  
  IF driver_user_id IS NOT NULL THEN
    -- Update profile for verified driver
    UPDATE profiles SET 
      is_verified = true,
      verification_status = 'approved',
      verification_reviewed_at = now(),
      active_role = 'driver',
      is_driver = true,
      role_set_at = now()
    WHERE id = driver_user_id;
    
    -- Ensure driver role exists
    INSERT INTO user_roles (user_id, role)
    VALUES (driver_user_id, 'driver')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- Get admin@cashridez.com user ID
  SELECT id INTO admin_user_id FROM auth.users WHERE email = 'admin@cashridez.com';
  
  IF admin_user_id IS NOT NULL THEN
    -- Update profile for admin
    UPDATE profiles SET 
      is_verified = true,
      verification_status = 'approved',
      verification_reviewed_at = now(),
      active_role = 'admin',
      role_set_at = now()
    WHERE id = admin_user_id;
    
    -- Ensure admin role exists
    INSERT INTO user_roles (user_id, role)
    VALUES (admin_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;