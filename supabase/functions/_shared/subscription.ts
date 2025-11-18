/**
 * Helper to check premium access on the backend
 * Use this in edge functions to enforce unlimited features
 */
export const hasPremiumAccess = (
  subscriptionActive?: boolean | null,
  subscriptionStatus?: string | null
): boolean => {
  if (!subscriptionActive) return false;
  return subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
};
