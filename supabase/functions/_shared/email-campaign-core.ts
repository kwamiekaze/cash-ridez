/**
 * Pure helpers shared by the admin email campaign edge functions and the
 * front-end "Recent Drivers" tool. Everything here is dependency-free so both
 * Deno (edge functions) and Node (vitest) can import it.
 */

/** The only audience sizes an admin may pick for a Recent Drivers campaign. */
export const DRIVER_AUDIENCE_SIZES = [10, 20, 30, 50] as const;
export type DriverAudienceSize = (typeof DRIVER_AUDIENCE_SIZES)[number];

/** Max recipients a single worker run may send. */
export const MAX_RECIPIENTS_PER_RUN = 10;
/** Minimum seconds between two Resend requests inside a run. */
export const DEFAULT_THROTTLE_SECONDS = 5;

export const MAX_SUBJECT_LENGTH = 200;
export const MAX_BODY_LENGTH = 10000;

export const CAMPAIGN_SENDER = "connect@cashridez.com";

export function isValidAudienceSize(value: unknown): value is DriverAudienceSize {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (DRIVER_AUDIENCE_SIZES as readonly number[]).includes(value)
  );
}

/** Replace {first_name} with the recipient's first name, or "there". */
export function renderTemplate(template: string, firstName?: string | null): string {
  const name = typeof firstName === "string" ? firstName.trim() : "";
  return String(template ?? "").replace(/\{first_name\}/g, name || "there");
}

/** Derive a usable first name from a profile's full/display name. */
export function deriveFirstName(fullName?: string | null, displayName?: string | null): string | null {
  const source = (fullName ?? "").trim() || (displayName ?? "").trim();
  if (!source) return null;
  const first = source.split(/\s+/)[0];
  return first || null;
}

export interface TemplateValidation {
  ok: boolean;
  error?: string;
}

export function validateTemplates(subject: unknown, body: unknown): TemplateValidation {
  const s = typeof subject === "string" ? subject.trim() : "";
  const b = typeof body === "string" ? body.trim() : "";
  if (s.length === 0) return { ok: false, error: "Subject is required." };
  if (s.length > MAX_SUBJECT_LENGTH) return { ok: false, error: `Subject must be ${MAX_SUBJECT_LENGTH} characters or fewer.` };
  if (b.length === 0) return { ok: false, error: "Body is required." };
  if (b.length > MAX_BODY_LENGTH) return { ok: false, error: `Body must be ${MAX_BODY_LENGTH} characters or fewer.` };
  return { ok: true };
}

/** Footer appended to the built-in presets. No deliverability promises. */
export const PRESET_FOOTER =
  "If you no longer want these updates, you can change your email notification preferences anytime at https://cashridez.com/profile.";

export interface EmailPreset {
  id: string;
  label: string;
  subject: string;
  body: string;
}

export const DRIVER_EMAIL_PRESETS: readonly EmailPreset[] = Object.freeze([
  {
    id: "new_ride_opportunity",
    label: "New ride opportunity",
    subject: "A new ride may be waiting near you",
    body: `Hi {first_name},

A new ride request may be available near your area. Sign in to your CashRidez driver account to review available trips, accept a ride, and get paid directly.

Open CashRidez: https://cashridez.com

Drive safely,
The CashRidez Team

CashRidez — powered by people, driven by cash 💰

${PRESET_FOOTER}`,
  },
  {
    id: "new_feature_alert",
    label: "New feature alert",
    subject: "New CashRidez features are ready",
    body: `Hi {first_name},

We've added new features to make CashRidez more useful for drivers. Please sign in at your convenience to explore the latest updates.

Open CashRidez: https://cashridez.com

The CashRidez Team
CashRidez — powered by people, driven by cash 💰

${PRESET_FOOTER}`,
  },
]);

/** Deterministic per-recipient idempotency key so a retry cannot duplicate a send. */
export function computeIdempotencyKey(campaignId: string, recipientId: string, variant = "primary"): string {
  return `crz-email-${campaignId}-${recipientId}-${variant}`;
}

/** True when a Resend response should be retried rather than marked failed. */
export function isRateLimited(status: number, message?: string | null): boolean {
  if (status === 429) return true;
  if (status >= 500) return true;
  const text = (message ?? "").toLowerCase();
  return text.includes("rate limit") || text.includes("too many requests");
}

/**
 * Milliseconds to wait after a rate-limited response. Honours Retry-After
 * (seconds or HTTP date) and otherwise backs off exponentially, capped.
 */
export function parseRetryAfterMs(
  retryAfter: string | null | undefined,
  attemptCount = 1,
  now = Date.now(),
): number {
  const MAX = 5 * 60_000;
  if (retryAfter) {
    const asNumber = Number(retryAfter);
    if (Number.isFinite(asNumber) && asNumber >= 0) {
      return Math.min(Math.round(asNumber * 1000), MAX);
    }
    const asDate = Date.parse(retryAfter);
    if (!Number.isNaN(asDate)) {
      return Math.min(Math.max(asDate - now, 0), MAX);
    }
  }
  const attempts = Math.max(1, Math.floor(attemptCount));
  return Math.min(DEFAULT_THROTTLE_SECONDS * 1000 * 2 ** (attempts - 1), MAX);
}

export interface RecipientStatusRow {
  status: string;
}

export interface CampaignCounts {
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  skipped: number;
  total: number;
  isComplete: boolean;
}

/** Recalculate campaign counters from the recipient rows (never increments). */
export function computeCampaignCounts(rows: readonly RecipientStatusRow[]): CampaignCounts {
  const counts: CampaignCounts = {
    queued: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    total: rows.length,
    isComplete: false,
  };
  for (const row of rows) {
    switch (row.status) {
      case "queued": counts.queued++; break;
      case "sending": counts.sending++; break;
      case "sent": counts.sent++; break;
      case "failed": counts.failed++; break;
      case "skipped": counts.skipped++; break;
    }
  }
  counts.isComplete = counts.queued === 0 && counts.sending === 0;
  return counts;
}

/**
 * Rough completion estimate in seconds: batches of MAX_RECIPIENTS_PER_RUN,
 * throttleSeconds between sends inside a batch, one batch per cron minute.
 */
export function estimateCompletionSeconds(
  recipientCount: number,
  throttleSeconds = DEFAULT_THROTTLE_SECONDS,
  perRun = MAX_RECIPIENTS_PER_RUN,
): number {
  if (recipientCount <= 0) return 0;
  const batches = Math.ceil(recipientCount / perRun);
  const lastBatchSize = recipientCount - (batches - 1) * perRun;
  return (batches - 1) * 60 + Math.max(0, lastBatchSize - 1) * throttleSeconds;
}

export function formatDurationShort(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/** Deduplicate candidate rows by lower-cased email, keeping the first (most recent). */
export interface DriverCandidate {
  user_id?: string | null;
  email: string;
  first_name?: string | null;
  last_active_at?: string | null;
}

export function dedupeByEmail(rows: readonly DriverCandidate[]): DriverCandidate[] {
  const seen = new Set<string>();
  const out: DriverCandidate[] = [];
  for (const row of rows) {
    const email = typeof row?.email === "string" ? row.email.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ ...row, email });
  }
  return out;
}
