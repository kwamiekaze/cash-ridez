/**
 * Map permission utilities
 * Determines who can update their pin on the live map
 */

export interface MapPermissionProfile {
  verification_status?: string | null;
  is_verified?: boolean | null;
}

/**
 * Check if a user can update their map pin
 * Only fully verified users (verification_status = 'approved') and admins can update pins
 * Pending/rejected users are treated like anonymous viewers - can see map but cannot update pin
 */
export function canUserUpdateMapPin(
  profile: MapPermissionProfile | null | undefined,
  isAdmin: boolean
): boolean {
  // Admins always can update pins
  if (isAdmin) return true;
  
  // No profile = no permission
  if (!profile) return false;
  
  // Only fully verified users can update pins
  // Check both is_verified flag and verification_status for robustness
  return profile.is_verified === true || profile.verification_status === 'approved';
}
