/**
 * Map Presence Utilities
 * Helper functions for map marker styling based on user activity recency
 */

// 7-day cutoff in milliseconds (1 week)
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Determines the ring status for a map marker based on location_updated_at timestamp.
 * Used for non-admin views to show activity recency via ring color.
 * 
 * @param locationUpdatedAt - ISO timestamp of last location update
 * @returns 'active' if within 7 days, 'stale' if older
 */
export function getMapPresenceRingStatus(locationUpdatedAt: string | null | undefined): 'active' | 'stale' {
  if (!locationUpdatedAt) {
    return 'stale';
  }
  
  const now = Date.now();
  const lastUpdate = new Date(locationUpdatedAt).getTime();
  const diffMs = now - lastUpdate;
  
  // Active within last 7 days = gold ring, older = grey ring
  return diffMs <= ONE_WEEK_MS ? 'active' : 'stale';
}

/**
 * Returns the border color for a map marker based on activity status
 * @param status - 'active' or 'stale' from getMapPresenceRingStatus
 * @returns CSS color string
 */
export function getRingColor(status: 'active' | 'stale'): string {
  return status === 'active' ? '#FACC15' : '#6B7280'; // Gold for active, grey for stale
}
