/**
 * Pure helpers for ID-verification decision emails (approval / rejection).
 *
 * Kept dependency-free so both Deno (edge functions) and Vitest (node) can
 * import it. No network, no Supabase, no Resend.
 */

export const APP_BASE_URL = "https://cashridez.com";
export const PROFILE_URL = `${APP_BASE_URL}/profile`;
/** Re-verification flow: Onboarding page handles rejected -> resubmit ID. */
export const REVERIFY_URL = `${APP_BASE_URL}/onboarding`;

export const DEFAULT_REJECTION_REASON =
  "Your submitted ID could not be verified. The photo may have been unclear, cropped, expired, or did not match your account details.";

export type Decision = "approved" | "rejected";

export interface DecisionQueueRow {
  id: string;
  user_id: string;
  user_email: string;
  first_name: string | null;
  is_driver: boolean;
  is_rider: boolean;
  decision?: string | null;
  rejection_reason?: string | null;
  attempts?: number | null;
}

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
  "=": "&#61;",
  "/": "&#47;",
};

/** Escape any user/admin supplied value before it reaches an HTML body. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'`=/]/g, (c) => HTML_ENTITIES[c] ?? c);
}

/** Normalise the stored decision; anything unknown is treated as approved. */
export function normalizeDecision(value: unknown): Decision {
  return value === "rejected" ? "rejected" : "approved";
}

/** The authoritative reason, or a professional fallback when blank. */
export function resolveRejectionReason(reason: unknown): string {
  const text = typeof reason === "string" ? reason.trim() : "";
  return text.length > 0 ? text : DEFAULT_REJECTION_REASON;
}

/** Greeting name, trimmed and safe. */
export function resolveFirstName(firstName: unknown): string {
  const text = typeof firstName === "string" ? firstName.trim() : "";
  return text.length > 0 ? text : "there";
}

/** Driver copy takes priority when a user holds both roles. */
export function getPrimaryRole(
  isDriver: boolean,
  isRider: boolean,
): "driver" | "rider" {
  return isDriver ? "driver" : "rider";
}

/**
 * The email_logs email_type for a decision. Approvals keep their historical
 * role-specific types so existing logs stay comparable.
 */
export function decisionEmailType(
  decision: Decision,
  role: "driver" | "rider",
): string {
  if (decision === "rejected") return "verification_rejected";
  return role === "driver"
    ? "verification_welcome_driver"
    : "verification_welcome_rider";
}

/**
 * Idempotency is per queue decision event, never per user lifetime, so a
 * later re-approval after a resubmission is still delivered.
 */
export function decisionIdempotencyKey(queueId: string): string {
  return `verification-decision-${queueId}`;
}

/** Direct (non-queue) invocations use synthetic ids we must not persist against. */
export function isSyntheticQueueId(id: string): boolean {
  return id.startsWith("direct-") || id.startsWith("test-");
}

export const MAX_DECISION_ATTEMPTS = 3;

/** Exponential-ish backoff in milliseconds for a bounded retry. */
export function retryDelayMs(attempts: number): number {
  const n = Math.max(0, attempts);
  return Math.min(30 * 60_000, 60_000 * Math.pow(3, n));
}

export function shouldRetry(attempts: number): boolean {
  return attempts + 1 < MAX_DECISION_ATTEMPTS;
}

/**
 * Whether a profile update transition must enqueue a decision email.
 * Only NEW transitions count — historical rows are never backfilled.
 */
export function shouldEnqueueDecision(
  oldStatus: string | null | undefined,
  newStatus: string | null | undefined,
): boolean {
  if (newStatus !== "approved" && newStatus !== "rejected") return false;
  return oldStatus !== newStatus;
}

const button = (href: string, label: string) =>
  `<p style="text-align: center; margin: 32px 0;">
    <a href="${href}" style="background: #facc15; color: #000; text-decoration: none; font-weight: bold; font-size: 16px; padding: 14px 28px; border-radius: 8px; display: inline-block;">${label}</a>
  </p>`;

const shell = (headline: string, sub: string, body: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #000 0%, #1a1a1a 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #facc15; margin: 0; font-size: 24px;">${headline}</h1>
    <p style="color: #fff; margin: 10px 0 0 0; font-size: 16px;">${sub}</p>
  </div>
  ${body}
  <div style="background: #000; color: #facc15; padding: 20px; border-radius: 8px; margin-top: 30px; text-align: center;">
    <p style="margin: 0; color: #fff; font-size: 14px;">— CashRidez Team<br>CashRidez Connect LLC</p>
  </div>
</body>
</html>`;

export interface BuiltEmail {
  subject: string;
  html: string;
}

export function buildApprovalEmail(
  firstName: unknown,
  role: "driver" | "rider",
): BuiltEmail {
  const name = escapeHtml(resolveFirstName(firstName));
  const roleGuidance = role === "driver"
    ? `<ul style="font-size: 16px;">
        <li>Add your profile photo and vehicle details</li>
        <li>Update your approximate pin on the map so nearby riders can find you</li>
        <li>Review open trips and start earning cash</li>
      </ul>`
    : `<ul style="font-size: 16px;">
        <li>Add your profile photo and contact details</li>
        <li>Update your approximate pin on the map so nearby drivers can see you</li>
        <li>Post your first trip request</li>
      </ul>`;

  const body = `
  <p style="font-size: 16px;">Hi ${name},</p>
  <p style="font-size: 16px;"><strong>Your ID has been accepted and your CashRidez account is now verified.</strong></p>
  <p style="font-size: 16px;">Please sign in and complete your profile so the community can recognise and trust your account.</p>
  ${button(PROFILE_URL, "Update My Profile")}
  <p style="font-size: 16px;">Or open this link: <a href="${PROFILE_URL}" style="color: #b45309;">${PROFILE_URL}</a></p>
  <hr style="border: none; border-top: 2px solid #facc15; margin: 30px 0;">
  <h2 style="color: #000; font-size: 18px;">What to do next</h2>
  ${roleGuidance}`;

  return {
    subject: role === "driver"
      ? "✅ ID Accepted — Your CashRidez Driver Account Is Verified"
      : "✅ ID Accepted — Your CashRidez Account Is Verified",
    html: shell(
      "✅ Your ID Was Accepted",
      "Your CashRidez account is verified",
      body,
    ),
  };
}

export function buildRejectionEmail(
  firstName: unknown,
  reason: unknown,
): BuiltEmail {
  const name = escapeHtml(resolveFirstName(firstName));
  const safeReason = escapeHtml(resolveRejectionReason(reason));

  const body = `
  <p style="font-size: 16px;">Hi ${name},</p>
  <p style="font-size: 16px;"><strong>We reviewed the ID you submitted and it was rejected.</strong> Your account has not been verified yet.</p>
  <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 24px 0; border-radius: 8px;">
    <h3 style="margin-top: 0; color: #991b1b; font-size: 16px;">Reason for rejection</h3>
    <p style="color: #991b1b; font-size: 16px; white-space: pre-wrap; margin: 0;">${safeReason}</p>
  </div>
  <p style="font-size: 16px;">Please reverify at your earliest convenience by submitting a clear, well-lit photo of a valid government-issued ID.</p>
  ${button(REVERIFY_URL, "Reverify My ID")}
  <p style="font-size: 16px;">Or open this link: <a href="${REVERIFY_URL}" style="color: #b45309;">${REVERIFY_URL}</a></p>`;

  return {
    subject: "⚠️ Action Needed — Your CashRidez ID Was Rejected",
    html: shell(
      "⚠️ Your ID Was Rejected",
      "Please reverify your CashRidez account",
      body,
    ),
  };
}

export function buildDecisionEmail(
  decision: Decision,
  opts: {
    firstName?: unknown;
    isDriver?: boolean;
    isRider?: boolean;
    rejectionReason?: unknown;
  },
): BuiltEmail {
  if (decision === "rejected") {
    return buildRejectionEmail(opts.firstName, opts.rejectionReason);
  }
  return buildApprovalEmail(
    opts.firstName,
    getPrimaryRole(Boolean(opts.isDriver), Boolean(opts.isRider)),
  );
}
