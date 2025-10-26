// ZIP proximity utilities using SCF (first 3 digits) and Haversine distance
// Free approach using a static subset of common US ZIP centroids

// Sample ZIP centroids (lat/lng) for common US ZIPs
// In production, expand this with a full dataset from US Census/USPS
export const ZIP_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  // Georgia (Atlanta area)
  '30117': { lat: 34.0758, lng: -84.6177 }, // Cartersville
  '30118': { lat: 34.1518, lng: -84.5844 }, // Cartersville
  '30120': { lat: 34.0151, lng: -84.5522 }, // Cartersville
  '30121': { lat: 34.1681, lng: -84.8299 }, // Cartersville
  '30135': { lat: 33.9207, lng: -84.9299 }, // Douglasville
  '30140': { lat: 33.9032, lng: -84.2877 }, // Lithia Springs
  '30141': { lat: 33.9965, lng: -84.7844 }, // Hiram
  '30144': { lat: 33.9526, lng: -84.5499 }, // Kennesaw
  '30152': { lat: 33.9526, lng: -84.5180 }, // Kennesaw
  '30168': { lat: 33.9166, lng: -84.6133 }, // Austell
  '30180': { lat: 33.6857, lng: -84.7941 }, // Villa Rica
  '30101': { lat: 33.9765, lng: -84.2010 }, // Acworth
  '30102': { lat: 33.9332, lng: -84.6349 }, // Acworth
  '30127': { lat: 33.9512, lng: -84.3355 }, // Powder Springs
  '30060': { lat: 33.8823, lng: -84.5155 }, // Marietta
  '30062': { lat: 33.9651, lng: -84.5194 }, // Marietta
  '30064': { lat: 33.9526, lng: -84.4833 }, // Marietta
  '30066': { lat: 33.9651, lng: -84.5499 }, // Marietta
  '30067': { lat: 33.9526, lng: -84.5180 }, // Marietta
  '30068': { lat: 33.9332, lng: -84.4833 }, // Marietta
  '30080': { lat: 33.8823, lng: -84.5155 }, // Smyrna
  '30082': { lat: 33.8823, lng: -84.4833 }, // Smyrna
  '30303': { lat: 33.7490, lng: -84.3880 }, // Atlanta
  '30305': { lat: 33.8415, lng: -84.3880 }, // Atlanta
  '30306': { lat: 33.7796, lng: -84.3538 }, // Atlanta
  '30307': { lat: 33.7676, lng: -84.3399 }, // Atlanta
  '30308': { lat: 33.7718, lng: -84.3851 }, // Atlanta
  '30309': { lat: 33.7835, lng: -84.3851 }, // Atlanta
  '30310': { lat: 33.7323, lng: -84.4147 }, // Atlanta
  '30311': { lat: 33.7323, lng: -84.4466 }, // Atlanta
  '30312': { lat: 33.7490, lng: -84.3732 }, // Atlanta
  '30313': { lat: 33.7568, lng: -84.3969 }, // Atlanta
  '30314': { lat: 33.7568, lng: -84.4230 }, // Atlanta
  '30315': { lat: 33.7068, lng: -84.3969 }, // Atlanta
  '30316': { lat: 33.7323, lng: -84.3538 }, // Atlanta
  '30317': { lat: 33.7490, lng: -84.3399 }, // Atlanta
  '30318': { lat: 33.7796, lng: -84.4230 }, // Atlanta
  '30319': { lat: 33.8568, lng: -84.3399 }, // Atlanta
  '30324': { lat: 33.8154, lng: -84.3538 }, // Atlanta
  '30326': { lat: 33.8485, lng: -84.3616 }, // Atlanta
  '30327': { lat: 33.8568, lng: -84.4147 }, // Atlanta
  '30328': { lat: 33.9320, lng: -84.3644 }, // Atlanta
  '30329': { lat: 33.8235, lng: -84.3260 }, // Atlanta
  '30331': { lat: 33.7068, lng: -84.5016 }, // Atlanta
  '30332': { lat: 33.7796, lng: -84.3969 }, // Atlanta
  '30336': { lat: 33.7235, lng: -84.5016 }, // Atlanta
  '30337': { lat: 33.6568, lng: -84.4466 }, // Atlanta
  '30338': { lat: 33.9320, lng: -84.2910 }, // Atlanta
  '30339': { lat: 33.8823, lng: -84.4655 }, // Atlanta
  '30340': { lat: 33.9154, lng: -84.2693 }, // Atlanta
  '30341': { lat: 33.8823, lng: -84.2910 }, // Atlanta
  '30342': { lat: 33.8823, lng: -84.3644 }, // Atlanta
  '30344': { lat: 33.6901, lng: -84.4466 }, // Atlanta
  '30345': { lat: 33.8568, lng: -84.2910 }, // Atlanta
  '30346': { lat: 33.9154, lng: -84.3399 }, // Atlanta
  '30349': { lat: 33.6234, lng: -84.4912 }, // Atlanta
  '30350': { lat: 33.9651, lng: -84.3399 }, // Atlanta
};

// Configuration
export const NEARBY_RADIUS_MI = 25; // Default radius in miles

/**
 * Haversine distance between two points in miles
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
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

/**
 * Get SCF prefix (first 3 digits) from a ZIP
 */
export function getScfPrefix(zip: string): string {
  return zip.slice(0, 3);
}

/**
 * Check if two ZIPs are in the same SCF area (first 3 digits match)
 */
export function isSameScf(zip1: string, zip2: string): boolean {
  return getScfPrefix(zip1) === getScfPrefix(zip2);
}

/**
 * Calculate distance between two ZIPs using centroids
 * Returns distance in miles, or null if either ZIP is not in our dataset
 */
export function getZipDistance(zip1: string, zip2: string): number | null {
  const centroid1 = ZIP_CENTROIDS[zip1];
  const centroid2 = ZIP_CENTROIDS[zip2];

  if (!centroid1 || !centroid2) {
    return null;
  }

  return haversineDistance(
    centroid1.lat,
    centroid1.lng,
    centroid2.lat,
    centroid2.lng
  );
}

/**
 * Check if two ZIPs are nearby (either same SCF or within radius)
 */
export function areZipsNearby(
  zip1: string,
  zip2: string,
  radiusMiles: number = NEARBY_RADIUS_MI
): { nearby: boolean; distance: number | null; reason: 'scf' | 'radius' | null } {
  // Same ZIP is always nearby
  if (zip1 === zip2) {
    return { nearby: true, distance: 0, reason: 'scf' };
  }

  // Check SCF match (fast)
  if (isSameScf(zip1, zip2)) {
    const distance = getZipDistance(zip1, zip2);
    return { nearby: true, distance, reason: 'scf' };
  }

  // Check radius distance
  const distance = getZipDistance(zip1, zip2);
  if (distance !== null && distance <= radiusMiles) {
    return { nearby: true, distance, reason: 'radius' };
  }

  return { nearby: false, distance, reason: null };
}

/**
 * Find all ZIPs nearby to a given ZIP within the radius
 * Returns array of { zip, distance, reason }
 */
export function findNearbyZips(
  targetZip: string,
  radiusMiles: number = NEARBY_RADIUS_MI
): Array<{ zip: string; distance: number | null; reason: 'scf' | 'radius' }> {
  const nearbyZips: Array<{ zip: string; distance: number | null; reason: 'scf' | 'radius' }> = [];
  const scfPrefix = getScfPrefix(targetZip);

  for (const zip of Object.keys(ZIP_CENTROIDS)) {
    if (zip === targetZip) continue;

    const result = areZipsNearby(targetZip, zip, radiusMiles);
    if (result.nearby && result.reason) {
      nearbyZips.push({
        zip,
        distance: result.distance,
        reason: result.reason,
      });
    }
  }

  // Sort by distance (nulls last)
  nearbyZips.sort((a, b) => {
    if (a.distance === null) return 1;
    if (b.distance === null) return -1;
    return a.distance - b.distance;
  });

  return nearbyZips;
}

/**
 * Format distance for display
 */
export function formatDistance(distanceMi: number | null): string {
  if (distanceMi === null) return '';
  if (distanceMi === 0) return 'Same location';
  if (distanceMi < 1) return '< 1 mi';
  return `~${Math.round(distanceMi)} mi`;
}
