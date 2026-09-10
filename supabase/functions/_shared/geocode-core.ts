/**
 * Pure helpers for the server-side address lookup (geocoding) proxy.
 *
 * All parsing/validation lives here so it can be unit tested without any
 * network or database access. The Edge Function is a thin shell around these.
 */

/** Nominatim's public usage policy: at most one request per second, globally. */
export const NOMINATIM_MIN_INTERVAL_MS = 1000;

/** Identifies CashRidez to Nominatim, as its policy requires. */
export const NOMINATIM_USER_AGENT =
  "CashRidez/1.0 (https://cashridez.com; connect@cashridez.com)";
export const NOMINATIM_REFERER = "https://cashridez.com";

export const MAX_ADDRESS_LENGTH = 500;
export const MIN_ADDRESS_LENGTH = 4;

/** The single state this product currently serves. */
export const ALLOWED_STATE = "Georgia";

export interface GeocodeResult {
  lat: number;
  lng: number;
  zip: string;
  displayName: string | null;
}

export type GeocodeFailure =
  | "invalid_input"
  | "not_found"
  | "out_of_area"
  | "no_zip"
  | "upstream_error"
  | "rate_limited";

/** Strict input validation: must be a plausible free-text US address string. */
export function validateAddressInput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < MIN_ADDRESS_LENGTH) return null;
  if (trimmed.length > MAX_ADDRESS_LENGTH) return null;
  // Control characters are never part of an address.
  // deno-lint-ignore no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed;
}

/** Stable cache key: case/whitespace/punctuation insensitive. */
export function normalizeAddressKey(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Five-digit ZIP, or null. Handles ZIP+4 and stray whitespace. */
export function normalizeZip5(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const match = String(value).trim().match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Parses one Nominatim jsonv2 entry into a trusted result, or a failure code. */
export function parseNominatimResult(
  raw: unknown,
): { ok: true; result: GeocodeResult } | { ok: false; reason: GeocodeFailure } {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not_found" };
  const entry = raw as Record<string, unknown>;

  const lat = Number(entry.lat);
  const lng = Number(entry.lon);
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
    return { ok: false, reason: "not_found" };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, reason: "not_found" };
  }

  const address = (entry.address ?? {}) as Record<string, unknown>;
  const state = typeof address.state === "string" ? address.state : "";
  if (state.trim().toLowerCase() !== ALLOWED_STATE.toLowerCase()) {
    return { ok: false, reason: "out_of_area" };
  }

  const zip = normalizeZip5(address.postcode);
  if (!zip) return { ok: false, reason: "no_zip" };

  const displayName = typeof entry.display_name === "string" ? entry.display_name : null;
  return { ok: true, result: { lat, lng, zip, displayName } };
}

/** Query string for the Nominatim search endpoint, per its usage policy. */
export function buildNominatimUrl(address: string): string {
  const params = new URLSearchParams({
    q: address,
    format: "jsonv2",
    addressdetails: "1",
    limit: "1",
    countrycodes: "us",
  });
  return `https://nominatim.openstreetmap.org/search?${params.toString()}`;
}

/** User-facing copy for each failure. Never leaks upstream detail. */
export function failureMessage(reason: GeocodeFailure): string {
  switch (reason) {
    case "invalid_input":
      return "Please enter a valid street address.";
    case "out_of_area":
      return "We could only find that address outside our Georgia service area.";
    case "no_zip":
      return "We couldn't find a ZIP code for that address. Please add more detail.";
    case "rate_limited":
      return "Address lookup is busy right now. Please try again in a moment.";
    case "upstream_error":
      return "We couldn't look up that address right now. Please try again.";
    default:
      return "We couldn't find that address. Please check it and try again.";
  }
}
