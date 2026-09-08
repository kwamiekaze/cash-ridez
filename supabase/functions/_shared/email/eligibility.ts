/**
 * Who may receive which email.
 *
 * Two independent gates, both required for OPTIONAL mail (trip / offer /
 * message / status):
 *   1. Trusted entitlement — a paying subscriber (active|trialing) or the
 *      existing trusted admin premium grant (subscription_active with status
 *      'premium' and NO stripe subscription id).
 *   2. The recipient's own notification preference for that category.
 *
 * ESSENTIAL mail (verification decision, account safety) bypasses both gates.
 */

export type EmailCategory =
  | "new_trip"
  | "ride_update"
  | "offer"
  | "message"
  | "membership"
  | "verification_decision"
  | "account_safety";

export interface RecipientProfileLike {
  id?: string | null;
  email?: string | null;
  full_name?: string | null;
  is_verified?: boolean | null;
  is_driver?: boolean | null;
  is_rider?: boolean | null;
  subscription_active?: boolean | null;
  subscription_status?: string | null;
  stripe_subscription_id?: string | null;
  notification_preferences?: unknown;
}

/** Categories that are always delivered, entitlement and preference aside. */
const ESSENTIAL: ReadonlySet<EmailCategory> = new Set<EmailCategory>([
  "verification_decision",
  "account_safety",
  "membership",
]);

export function isEssentialCategory(category: EmailCategory): boolean {
  return ESSENTIAL.has(category);
}

/**
 * Trusted entitlement, mirroring the database's connection_entitlement rule.
 * Fails closed on anything unexpected.
 */
export function hasTrustedEntitlement(profile: RecipientProfileLike | null | undefined): boolean {
  if (!profile) return false;
  if (profile.subscription_active !== true) return false;
  const status = typeof profile.subscription_status === "string"
    ? profile.subscription_status.trim().toLowerCase()
    : "";
  if (status === "active" || status === "trialing") return true;
  // Trusted admin grant: premium with no Stripe subscription behind it.
  if (status === "premium" && !profile.stripe_subscription_id) return true;
  return false;
}

/** Preference keys consulted per category, in addition to all_notifications. */
const CATEGORY_KEYS: Record<EmailCategory, string[]> = {
  // new_offers is the legacy key still written by the preferences UI.
  new_trip: ["new_trips", "new_offers"],
  ride_update: ["ride_updates"],
  offer: ["new_offers", "new_trips"],
  message: ["messages"],
  membership: [],
  verification_decision: [],
  account_safety: [],
};

/** Defaults used when a key has never been written by the preferences UI. */
const DEFAULTS: Record<string, boolean> = {
  all_notifications: false,
  new_trips: false,
  new_offers: false,
  messages: true,
  ride_updates: true,
  read_receipts: true,
  system_messages: true,
};

export function parsePreferences(raw: unknown): Record<string, boolean> {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = null;
    }
  }
  const out: Record<string, boolean> = { ...DEFAULTS };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (typeof entry === "boolean") out[key] = entry;
    }
  }
  return out;
}

/** True when the recipient's preferences allow this category. */
export function preferenceAllows(raw: unknown, category: EmailCategory): boolean {
  if (isEssentialCategory(category)) return true;
  const prefs = parsePreferences(raw);
  if (prefs.all_notifications === true) return true;
  return CATEGORY_KEYS[category].some((key) => prefs[key] === true);
}

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
}

/**
 * The single decision point for "may we email this profile about X?".
 */
export function evaluateEmailEligibility(
  profile: RecipientProfileLike | null | undefined,
  category: EmailCategory,
): EligibilityResult {
  if (!profile) return { eligible: false, reason: "no_profile" };
  if (!profile.email) return { eligible: false, reason: "no_email" };

  if (isEssentialCategory(category)) return { eligible: true, reason: "essential" };

  if (!hasTrustedEntitlement(profile)) return { eligible: false, reason: "not_entitled" };
  if (!preferenceAllows(profile.notification_preferences, category)) {
    return { eligible: false, reason: "preference_off" };
  }
  return { eligible: true, reason: "ok" };
}

/** New-trip email additionally requires a verified driver. */
export function evaluateNewTripEligibility(
  profile: RecipientProfileLike | null | undefined,
  options: { riderId?: string | null } = {},
): EligibilityResult {
  if (!profile) return { eligible: false, reason: "no_profile" };
  if (options.riderId && profile.id && profile.id === options.riderId) {
    return { eligible: false, reason: "is_rider" };
  }
  if (profile.is_driver !== true) return { eligible: false, reason: "not_driver" };
  if (profile.is_verified !== true) return { eligible: false, reason: "not_verified" };
  return evaluateEmailEligibility(profile, "new_trip");
}
