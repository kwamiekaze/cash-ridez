/**
 * Helper function to check if a user has premium access
 * Returns true if subscription_active is true AND status is active or trialing
 */
export const hasPremiumAccess = (
  subscriptionActive?: boolean | null,
  subscriptionStatus?: string | null
): boolean => {
  if (!subscriptionActive) return false;
  return subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
};
