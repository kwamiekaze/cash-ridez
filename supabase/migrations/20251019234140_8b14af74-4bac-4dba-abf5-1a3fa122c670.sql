-- Update RLS policies to allow admins full access to profiles
-- This allows admins to see contact details and manage users

-- Drop existing admin policy and recreate with full access
DROP POLICY IF EXISTS "Admins view all profiles" ON profiles;

CREATE POLICY "Admins view all profiles with full access"
ON profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add admin update policy for all profile fields
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

CREATE POLICY "Admins can update any profile"
ON profiles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Ensure admins can view all ride requests
DROP POLICY IF EXISTS "Admins can view all requests" ON ride_requests;

CREATE POLICY "Admins can view all requests"
ON ride_requests
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update any ride request
CREATE POLICY "Admins can update any ride request"
ON ride_requests
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));