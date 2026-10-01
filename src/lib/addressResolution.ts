export interface ResolvedAddress {
  lat: number | null;
  lng: number | null;
  zip: string;
  verified: boolean;
}

const GEORGIA_ZIP_PREFIXES = ["30", "31", "398", "399"];

export function extractZip5(address: string): string | null {
  return address.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? null;
}

export function isGeorgiaZip(zip: string): boolean {
  return /^\d{5}$/.test(zip) && GEORGIA_ZIP_PREFIXES.some((prefix) => zip.startsWith(prefix));
}

/**
 * Preserve a rider-entered address when the map provider cannot resolve it.
 * A Georgia ZIP is still required so local trip discovery and notifications
 * remain correctly scoped. Coordinates stay null instead of inventing a pin.
 */
export function manualAddressFallback(address: string): ResolvedAddress | null {
  const normalized = address.trim().replace(/\s+/g, " ");
  if (normalized.length < 8) return null;

  const zip = extractZip5(normalized);
  if (!zip || !isGeorgiaZip(zip)) return null;

  return { lat: null, lng: null, zip, verified: false };
}
