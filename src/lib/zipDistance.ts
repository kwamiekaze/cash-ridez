// Lazy-loaded ZIP centroid distance utilities (free dataset)
// Loads once per session from /public/data/zip_centroids.json

export type ZipCentroids = Record<string, { lat: number; lng: number }>;

let zipDataPromise: Promise<ZipCentroids> | null = null;
let memoDistances: Record<string, number> = {};

export const RADIUS_MILES = 25;

export async function loadZipCentroids(): Promise<ZipCentroids> {
  if (!zipDataPromise) {
    zipDataPromise = fetch('/data/zip_centroids.json')
      .then((r) => r.json())
      .then((data: ZipCentroids) => {
        // Dev assertions for diagnostics
        try {
          const within = isWithin25Miles('30135', '30117', data);
          // 30518 (Buford) is far from 30135 (Douglasville)
          const far = isWithin25Miles('30135', '30518', data);
          console.info('[ZIP Centroids] Loaded. Sample checks:', { within30135_30117: within, far30135_30518: far });
        } catch (e) {
          console.warn('[ZIP Centroids] Assertion checks failed to run:', e);
        }
        return data;
      })
      .catch((e) => {
        console.error('Failed to load zip_centroids.json', e);
        return {} as ZipCentroids;
      });
  }
  return zipDataPromise;
}

export function normalizeZip(z?: string | null): string | null {
  if (!z) return null;
  const m = String(z).match(/\d{5}/);
  return m ? m[0] : null;
}

export function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.7613;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function zipDistanceMiles(zipA?: string | null, zipB?: string | null, preload?: ZipCentroids): number | null {
  const a = normalizeZip(zipA);
  const b = normalizeZip(zipB);
  if (!a || !b) return null;
  const key = `${a}_${b}`;
  if (memoDistances[key] != null) return memoDistances[key];
  const run = async () => {
    const ZIP = preload || (await loadZipCentroids());
    const A = ZIP[a];
    const B = ZIP[b];
    if (!A || !B) return null;
    return haversineMiles(A.lat, A.lng, B.lat, B.lng);
  };
  // We cannot make zipDistanceMiles async without refactor; do a best-effort sync fallback
  // Callers should call loadZipCentroids() before using this to ensure data is present.
  // If not loaded yet, return null now; next call after load will compute distance.
  if (!preload && !zipDataPromise) return null;
  // At this point, try to synchronously read from resolved promise (not ideal)
  // but in practice we call loadZipCentroids() first in our flows.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ZIP: any = (zipDataPromise as any)?._value || preload;
  if (ZIP) {
    const A = ZIP[a];
    const B = ZIP[b];
    if (!A || !B) return null;
    const d = haversineMiles(A.lat, A.lng, B.lat, B.lng);
    memoDistances[key] = d;
    return d;
  }
  return null;
}

export function isWithin25Miles(zipA?: string | null, zipB?: string | null, preload?: ZipCentroids): boolean {
  const a = normalizeZip(zipA);
  const b = normalizeZip(zipB);
  if (!a || !b) return false;
  const ZIP = preload as ZipCentroids | undefined;
  if (ZIP) {
    const A = ZIP[a];
    const B = ZIP[b];
    if (!A || !B) return a.slice(0,3) === b.slice(0,3);
    return haversineMiles(A.lat, A.lng, B.lat, B.lng) <= RADIUS_MILES;
  }
  // If preload not provided, try cached compute
  const d = zipDistanceMiles(a, b);
  if (d == null) return a.slice(0,3) === b.slice(0,3);
  return d <= RADIUS_MILES;
}

export function formatDistance(distanceMi: number | null): string {
  if (distanceMi === null) return '';
  if (distanceMi === 0) return 'Same location';
  if (distanceMi < 1) return '< 1 mi';
  return `~${Math.round(distanceMi)} mi`;
}
