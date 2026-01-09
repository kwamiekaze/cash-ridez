/**
 * Map Presence Utilities
 * Helper functions for map marker styling based on user activity recency
 */

// 21-day cutoff in milliseconds (3 weeks) for "Active Recently" status
const THREE_WEEKS_MS = 21 * 24 * 60 * 60 * 1000;

/**
 * Determines the ring status for a map marker based on location_updated_at timestamp.
 * Used for non-admin views (public + logged-in drivers/riders) to show activity recency via ring color.
 * 
 * "Active Recently" = within 21 days (gold ring)
 * "Inactive" = older than 21 days (grey ring)
 * 
 * @param locationUpdatedAt - ISO timestamp of last location update
 * @returns 'active' if within 21 days, 'stale' if older
 */
export function getMapPresenceRingStatus(locationUpdatedAt: string | null | undefined): 'active' | 'stale' {
  if (!locationUpdatedAt) {
    return 'stale';
  }
  
  const now = Date.now();
  const lastUpdate = new Date(locationUpdatedAt).getTime();
  const diffMs = now - lastUpdate;
  
  // Active Recently = within last 21 days = gold ring, older = grey ring
  return diffMs <= THREE_WEEKS_MS ? 'active' : 'stale';
}

/**
 * Checks if a user is "Active Recently" (within 21 days)
 * @param locationUpdatedAt - ISO timestamp of last location update
 * @returns true if active within 21 days
 */
export function isActiveRecently(locationUpdatedAt: string | null | undefined): boolean {
  return getMapPresenceRingStatus(locationUpdatedAt) === 'active';
}

/**
 * Returns the border color for a map marker based on activity status
 * @param status - 'active' or 'stale' from getMapPresenceRingStatus
 * @returns CSS color string
 */
export function getRingColor(status: 'active' | 'stale'): string {
  return status === 'active' ? '#FACC15' : '#6B7280'; // Gold for active recently, grey for inactive
}
