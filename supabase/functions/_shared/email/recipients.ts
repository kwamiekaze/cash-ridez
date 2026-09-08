/**
 * The fixed operational admin alert allowlist.
 *
 * These three addresses are the ONLY recipients an admin alert (or the
 * synthetic [TEST] alert) may ever be delivered to. No request body, database
 * row or template may extend this list.
 */
import { safeEmailAddress } from "./escape.ts";

export const ADMIN_ALERT_RECIPIENTS: readonly string[] = Object.freeze([
  "kwamiekaze@gmail.com",
  "cashridezconnect@gmail.com",
  "connect@cashridez.com",
]);

/** Lower-case, trim, drop invalid entries and de-duplicate, order preserved. */
export function normalizeRecipients(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const address = safeEmailAddress(value);
    if (!address || seen.has(address)) continue;
    seen.add(address);
    out.push(address);
  }
  return out;
}

/** The canonical admin recipient list: always exactly the three addresses. */
export function adminRecipients(): string[] {
  return normalizeRecipients(ADMIN_ALERT_RECIPIENTS);
}

/** True when an address is on the admin allowlist (case/whitespace tolerant). */
export function isAdminRecipient(value: unknown): boolean {
  const address = safeEmailAddress(value);
  return address !== null && adminRecipients().includes(address);
}

/**
 * Filter any candidate list down to the admin allowlist. Used by the worker so
 * an admin-alert event can never fan out to a user-controlled address, even if
 * a payload were tampered with.
 */
export function restrictToAdminRecipients(values: readonly unknown[]): string[] {
  return normalizeRecipients(values).filter((address) => isAdminRecipient(address));
}
