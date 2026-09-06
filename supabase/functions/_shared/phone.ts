/**
 * Shared, dependency-free phone + TwiML helpers used by the masked calling
 * functions (call-start, call-voice). Keeping them here guarantees call-start
 * and the voice bridge resolve the SAME number for the SAME participant.
 */

/** Escape a value for safe interpolation into XML/TwiML. */
export function escapeXml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Characters a phone value may contain BEFORE stripping: digits, spaces and
 * the usual separators, with at most one leading "+". Anything else
 * ("678/928/8816", "678<928>8816", "++1...") is malformed and rejected.
 */
const ALLOWED_PHONE_CHARS = /^\+?[0-9 ().-]+$/;

/**
 * Normalize a raw phone string to strict US E.164 (+1XXXXXXXXXX).
 * Returns null for anything that is not unambiguously a valid US number —
 * malformed values are rejected rather than coerced.
 */
export function normalizeUsE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Reject any character outside the permitted set (also rejects letters and a
  // second "+", because "+" is only allowed as the very first character).
  if (!ALLOWED_PHONE_CHARS.test(trimmed)) return null;

  const digits = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("+")) {
    // An explicit country code must be complete: 11 digits beginning with 1.
    if (digits.length !== 11 || !digits.startsWith("1")) return null;
    const nsn = digits.slice(1);
    if (!isValidUsNsn(nsn)) return null;
    return `+1${nsn}`;
  }

  if (digits.length === 10) {
    if (!isValidUsNsn(digits)) return null;
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    const nsn = digits.slice(1);
    if (!isValidUsNsn(nsn)) return null;
    return `+1${nsn}`;
  }
  return null;
}

function isValidUsNsn(nsn: string): boolean {
  // NANP: area code and exchange code must start with 2-9.
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(nsn);
}

/** True when the value is already strict US E.164. */
export function isValidUsE164(phone: string | null | undefined): boolean {
  return !!phone && /^\+1[2-9]\d{2}[2-9]\d{6}$/.test(phone);
}

/**
 * Extract a phone number from the "Contact:" segment of a rider_note.
 * rider_note format: "Trip Details: ... | Contact: ... | Emergency: ..."
 */
export function extractContactFromRiderNote(riderNote: string | null | undefined): string | null {
  if (!riderNote) return null;
  const match = riderNote.match(/Contact:\s*([^|]+)/i);
  if (!match || !match[1]) return null;
  return normalizeUsE164(match[1]);
}

export interface PhoneSources {
  /** profiles.phone_number */
  profilePhone?: string | null;
  /** admin_user_notes.phone_override — internal only, never surfaced to users */
  adminOverride?: string | null;
  /** ride_requests.rider_note (rider only) */
  riderNote?: string | null;
}

export type PhoneSourceName = "profile" | "admin_override" | "rider_note";

export interface ResolvedPhone {
  phone: string | null;
  source: PhoneSourceName | null;
}

/**
 * Canonical resolution order, identical for call-start and the voice bridge:
 *   1. profiles.phone_number
 *   2. admin_user_notes.phone_override (historically required)
 *   3. rider_note "Contact:" fallback (rider only)
 * The source is returned for server-side logging only — it must never be
 * returned to a client, because it would reveal an internal admin override.
 */
export function resolveParticipantPhone(sources: PhoneSources): ResolvedPhone {
  const fromProfile = normalizeUsE164(sources.profilePhone);
  if (fromProfile) return { phone: fromProfile, source: "profile" };

  const fromOverride = normalizeUsE164(sources.adminOverride);
  if (fromOverride) return { phone: fromOverride, source: "admin_override" };

  const fromNote = extractContactFromRiderNote(sources.riderNote);
  if (fromNote) return { phone: fromNote, source: "rider_note" };

  return { phone: null, source: null };
}

/** Mask a phone for logs: +1678****8816 -> ***8816 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "none";
  return `***${String(phone).slice(-4)}`;
}
