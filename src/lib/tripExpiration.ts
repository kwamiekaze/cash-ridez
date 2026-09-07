/**
 * 48-hour trip expiration — the single client-side source of truth.
 *
 * The database is authoritative (expire_stale_rides() flips status to
 * 'expired'), but the scheduler can run up to ~1 minute behind the threshold.
 * Feeds and trip pages use these helpers so a stale trip is never shown as
 * open/active during that window.
 */

export const TRIP_EXPIRY_HOURS = 48;
export const TRIP_EXPIRY_MS = TRIP_EXPIRY_HOURS * 60 * 60 * 1000;

/** Oldest pickup_time that is still considered live, as an ISO string. */
export const tripExpiryCutoffISO = (now: Date = new Date()): string =>
  new Date(now.getTime() - TRIP_EXPIRY_MS).toISOString();

const UNFINISHED = new Set(["open", "assigned"]);

/**
 * True when an unfinished trip's posted pickup_time is more than 48 hours old.
 * Completed/cancelled/expired history is never re-classified.
 */
export const isExpiredTrip = (
  trip: { status?: string | null; pickup_time?: string | null } | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (!trip || !trip.status || !UNFINISHED.has(trip.status)) return false;
  if (!trip.pickup_time) return false;
  const t = new Date(trip.pickup_time).getTime();
  if (!Number.isFinite(t)) return false;
  return t < now.getTime() - TRIP_EXPIRY_MS;
};

/** Status to display/act on, folding in an expiry the scheduler has not applied yet. */
export const effectiveTripStatus = (
  trip: { status?: string | null; pickup_time?: string | null } | null | undefined,
  now: Date = new Date(),
): string | null | undefined => (isExpiredTrip(trip, now) ? "expired" : trip?.status);

/** Drop stale unfinished trips from an open/active feed. */
export const withoutExpiredTrips = <T extends { status?: string | null; pickup_time?: string | null }>(
  trips: T[],
  now: Date = new Date(),
): T[] => trips.filter((t) => !isExpiredTrip(t, now));
