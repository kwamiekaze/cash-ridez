/**
 * Map Presence Utilities
 * Helper functions for map marker styling based on user activity recency
 */

import { LIVE_MAP_ONLINE_RING_COUNT } from "@/lib/config";

// 21-day cutoff in milliseconds (3 weeks) for "Active Recently" status
const THREE_WEEKS_MS = 21 * 24 * 60 * 60 * 1000;

export type MapPresenceRingStatus = 'online' | 'active' | 'stale';

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
 * Rank-aware ring status. The map list is already sorted by location_updated_at DESC,
 * so the array index is the recency rank.
 *
 * rank < LIVE_MAP_ONLINE_RING_COUNT (and has a timestamp) -> 'online' (green)
 * otherwise -> the existing 21-day rule ('active' gold / 'stale' grey)
 */
export function getMapPresenceRingStatusByRank(
  rank: number,
  locationUpdatedAt: string | null | undefined
): MapPresenceRingStatus {
  if (rank >= 0 && rank < LIVE_MAP_ONLINE_RING_COUNT && locationUpdatedAt) {
    return 'online';
  }
  return getMapPresenceRingStatus(locationUpdatedAt);
}

/**
 * Checks if a user is "Active Recently" (within 21 days)
 */
export function isActiveRecently(locationUpdatedAt: string | null | undefined): boolean {
  return getMapPresenceRingStatus(locationUpdatedAt) === 'active';
}

/**
 * Returns the border color for a map marker based on activity status
 */
export function getRingColor(status: MapPresenceRingStatus): string {
  if (status === 'online') return '#22C55E'; // Green — most recently active
  if (status === 'active') return '#FACC15'; // Gold — active this month
  return '#6B7280'; // Grey — inactive
}
