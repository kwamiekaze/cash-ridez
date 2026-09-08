/**
 * Sender identity for the email event system.
 *
 * Preferred: CashRidez <connect@cashridez.com>.
 * Until cashridez.com is verified in Resend, the already-verified
 * updates.cashridez.com senders remain the fallback chain.
 */

export const PREFERRED_SENDER = "CashRidez <connect@cashridez.com>";
export const FALLBACK_SENDERS: readonly string[] = Object.freeze([
  "CashRidez <noreply@updates.cashridez.com>",
  "CashRidez <support@updates.cashridez.com>",
]);

/**
 * The ordered list of senders to try. The preferred root-domain sender is only
 * attempted once the root domain is verified; otherwise Resend would reject it.
 */
export function senderChain(rootDomainVerified: boolean): string[] {
  return rootDomainVerified
    ? [PREFERRED_SENDER, ...FALLBACK_SENDERS]
    : [...FALLBACK_SENDERS];
}
