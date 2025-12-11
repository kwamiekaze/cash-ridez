/**
 * Map Presence Utilities
 * Helper functions for map marker styling based on user activity recency
 */

// 72-hour cutoff in milliseconds
const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

/**
 * Determines the ring status for a map marker based on location_updated_at timestamp.
 * Used for non-admin views to show activity recency via ring color.
 * 
 * @param locationUpdatedAt - ISO timestamp of last location update
 * @returns 'active' if within 72 hours, 'stale' if older
 */
export function getMapPresenceRingStatus(locationUpdatedAt: string | null | undefined): 'active' | 'stale' {
  if (!locationUpdatedAt) {
    return 'stale';
  }
  
  const now = Date.now();
  const lastUpdate = new Date(locationUpdatedAt).getTime();
  const diffMs = now - lastUpdate;
  
  // Active within last 72 hours = gold ring, older = grey ring
  return diffMs <= SEVENTY_TWO_HOURS_MS ? 'active' : 'stale';
}

/**
 * Returns the border color for a map marker based on activity status
 * @param status - 'active' or 'stale' from getMapPresenceRingStatus
 * @returns CSS color string
 */
export function getRingColor(status: 'active' | 'stale'): string {
  return status === 'active' ? '#FACC15' : '#6B7280'; // Gold for active, grey for stale
}
