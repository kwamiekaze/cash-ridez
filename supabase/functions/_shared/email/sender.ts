/**
 * Sender identity for the email event system.
 *
 * connect@cashridez.com is the configured sending identity and is always
 * attempted first. The updates.cashridez.com addresses stay behind it purely
 * as fallbacks in case a send with the primary identity fails.
 *
 * No domain-list preflight is performed: a preflight that returned false (or
 * errored) used to skip the primary sender entirely, which caused every
 * delivery to be attempted only from the unverified fallback domain.
 */

export const PREFERRED_SENDER = "CashRidez <connect@cashridez.com>";
export const FALLBACK_SENDERS: readonly string[] = Object.freeze([
  "CashRidez <noreply@updates.cashridez.com>",
  "CashRidez <support@updates.cashridez.com>",
]);

/**
 * The ordered, de-duplicated list of senders to try: an optional caller
 * preference first, then the preferred identity, then the fallbacks.
 */
export function senderChain(preferred?: string | null): string[] {
  const chain: string[] = [];
  for (const candidate of [preferred, PREFERRED_SENDER, ...FALLBACK_SENDERS]) {
    const value = typeof candidate === "string" ? candidate.trim() : "";
    if (value && !chain.includes(value)) chain.push(value);
  }
  return chain;
}
