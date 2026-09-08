/**
 * Shared ZIP-proximity helper.
 *
 * This is the single source of truth for "is this driver near this pickup?".
 * It is used by send-new-trip-notification (in-app notifications) and by the
 * email outbox worker, so both fan out to exactly the same driver set:
 *   * within NEARBY_RADIUS_MI of the pickup ZIP centroid, OR
 *   * in the same 3-digit SCF (sectional center facility) prefix, which covers
 *     ZIPs that are missing from the centroid table.
 */

/** ZIP centroids for distance calculation (subset for the GA service area). */
export const ZIP_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  '30117': { lat: 34.0758, lng: -84.6177 },
  '30118': { lat: 34.1518, lng: -84.5844 },
  '30120': { lat: 34.0151, lng: -84.5522 },
  '30121': { lat: 34.1681, lng: -84.8299 },
  '30141': { lat: 33.9965, lng: -84.7844 },
  '30144': { lat: 33.9526, lng: -84.5499 },
  '30152': { lat: 33.9526, lng: -84.5180 },
  '30168': { lat: 33.9166, lng: -84.6133 },
  '30180': { lat: 33.6857, lng: -84.7941 },
  '30101': { lat: 33.9765, lng: -84.2010 },
  '30102': { lat: 33.9332, lng: -84.6349 },
  '30127': { lat: 33.9512, lng: -84.3355 },
  '30060': { lat: 33.8823, lng: -84.5155 },
  '30062': { lat: 33.9651, lng: -84.5194 },
  '30064': { lat: 33.9526, lng: -84.4833 },
  '30066': { lat: 33.9651, lng: -84.5499 },
  '30067': { lat: 33.9526, lng: -84.5180 },
  '30068': { lat: 33.9332, lng: -84.4833 },
  '30080': { lat: 33.8823, lng: -84.5155 },
  '30082': { lat: 33.8823, lng: -84.4833 },
  '30303': { lat: 33.7490, lng: -84.3880 },
  '30305': { lat: 33.8415, lng: -84.3880 },
  '30306': { lat: 33.7796, lng: -84.3538 },
  '30307': { lat: 33.7676, lng: -84.3399 },
  '30308': { lat: 33.7718, lng: -84.3851 },
  '30309': { lat: 33.7835, lng: -84.3851 },
  '30310': { lat: 33.7323, lng: -84.4147 },
  '30311': { lat: 33.7323, lng: -84.4466 },
  '30312': { lat: 33.7490, lng: -84.3732 },
  '30313': { lat: 33.7568, lng: -84.3969 },
  '30314': { lat: 33.7568, lng: -84.4230 },
  '30315': { lat: 33.7068, lng: -84.3969 },
  '30316': { lat: 33.7323, lng: -84.3538 },
  '30317': { lat: 33.7490, lng: -84.3399 },
  '30318': { lat: 33.7796, lng: -84.4230 },
  '30319': { lat: 33.8568, lng: -84.3399 },
  '30324': { lat: 33.8154, lng: -84.3538 },
  '30326': { lat: 33.8485, lng: -84.3616 },
  '30327': { lat: 33.8568, lng: -84.4147 },
  '30328': { lat: 33.9320, lng: -84.3644 },
  '30329': { lat: 33.8235, lng: -84.3260 },
  '30331': { lat: 33.7068, lng: -84.5016 },
  '30332': { lat: 33.7796, lng: -84.3969 },
  '30336': { lat: 33.7235, lng: -84.5016 },
  '30337': { lat: 33.6568, lng: -84.4466 },
  '30338': { lat: 33.9320, lng: -84.2910 },
  '30339': { lat: 33.8823, lng: -84.4655 },
  '30340': { lat: 33.9154, lng: -84.2693 },
  '30341': { lat: 33.8823, lng: -84.2910 },
  '30342': { lat: 33.8823, lng: -84.3644 },
  '30344': { lat: 33.6901, lng: -84.4466 },
  '30345': { lat: 33.8568, lng: -84.2910 },
  '30346': { lat: 33.9154, lng: -84.3399 },
  '30349': { lat: 33.6234, lng: -84.4912 },
  '30350': { lat: 33.9651, lng: -84.3399 },
};

/** The radius used by every "new trip near you" fan-out. */
export const NEARBY_RADIUS_MI = 25;

export function normalizeZip(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.trim().slice(0, 5);
  return /^\d{5}$/.test(digits) ? digits : null;
}

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Miles between two ZIP centroids, or null when either ZIP is unknown. */
export function getZipDistance(zip1: unknown, zip2: unknown): number | null {
  const a = normalizeZip(zip1);
  const b = normalizeZip(zip2);
  if (!a || !b) return null;
  const c1 = ZIP_CENTROIDS[a];
  const c2 = ZIP_CENTROIDS[b];
  if (!c1 || !c2) return null;
  return haversineDistance(c1.lat, c1.lng, c2.lat, c2.lng);
}

/** Same 3-digit sectional center facility prefix. */
export function isSameScf(zip1: unknown, zip2: unknown): boolean {
  const a = normalizeZip(zip1);
  const b = normalizeZip(zip2);
  if (!a || !b) return false;
  return a.slice(0, 3) === b.slice(0, 3);
}

/**
 * The canonical nearby test: within the radius by centroid distance, or the
 * same SCF when a centroid is unavailable for either ZIP.
 */
export function isNearbyZip(
  driverZip: unknown,
  pickupZip: unknown,
  radiusMiles: number = NEARBY_RADIUS_MI,
): boolean {
  const distance = getZipDistance(driverZip, pickupZip);
  if (distance !== null && distance <= radiusMiles) return true;
  return isSameScf(driverZip, pickupZip);
}
