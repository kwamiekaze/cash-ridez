/**
 * Compatibility helpers for Stripe API version 2025-08-27.basil (stripe@18.5.0).
 *
 * Two breaking payload changes are handled here without upgrading the SDK or
 * changing the pinned API version:
 *
 *  1. `Subscription.current_period_end` moved to
 *     `Subscription.items.data[].current_period_end`.
 *  2. `Invoice.subscription` moved to
 *     `Invoice.parent.subscription_details.subscription`.
 *
 * Both readers keep a legacy fallback so replayed/older event payloads and
 * responses from older API versions still parse correctly.
 *
 * These functions are intentionally dependency-free and side-effect-free so
 * they can be unit tested outside the Deno runtime.
 */

export type UnknownRecord = Record<string, any>;

const ACTIVE_STATUSES = ["active", "trialing"] as const;

/** Statuses that grant entitlement. */
export function isActiveStatus(status?: string | null): boolean {
  return !!status && (ACTIVE_STATUSES as readonly string[]).includes(status);
}

/**
 * Read the current period end (unix seconds) from a subscription object.
 * Prefers the new per-item field; falls back to the legacy top-level field.
 * Returns null when neither is present (never guesses a date).
 */
export function getSubscriptionPeriodEnd(subscription: UnknownRecord | null | undefined): number | null {
  if (!subscription) return null;

  const items: UnknownRecord[] = subscription?.items?.data ?? [];
  let maxEnd: number | null = null;
  for (const item of items) {
    const end = item?.current_period_end;
    if (typeof end === "number" && Number.isFinite(end)) {
      maxEnd = maxEnd === null ? end : Math.max(maxEnd, end);
    }
  }
  if (maxEnd !== null) return maxEnd;

  const legacy = subscription?.current_period_end;
  if (typeof legacy === "number" && Number.isFinite(legacy)) return legacy;

  return null;
}

/** Convert a unix-seconds period end to an ISO string, or null. */
export function periodEndToIso(periodEnd: number | null): string | null {
  if (periodEnd === null) return null;
  const ms = periodEnd * 1000;
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * Read the subscription id referenced by an invoice.
 * Prefers the new `parent.subscription_details.subscription`; falls back to the
 * legacy top-level `invoice.subscription`. Handles both string ids and expanded
 * objects. Returns null for one-off (non-subscription) invoices.
 */
export function getInvoiceSubscriptionId(invoice: UnknownRecord | null | undefined): string | null {
  if (!invoice) return null;

  const modern = invoice?.parent?.subscription_details?.subscription;
  const resolvedModern = normalizeIdRef(modern);
  if (resolvedModern) return resolvedModern;

  // Some payloads nest the subscription reference under the line items.
  const lines: UnknownRecord[] = invoice?.lines?.data ?? [];
  for (const line of lines) {
    const fromLine = normalizeIdRef(line?.parent?.subscription_item_details?.subscription ?? line?.subscription);
    if (fromLine) return fromLine;
  }

  return normalizeIdRef(invoice?.subscription);
}

function normalizeIdRef(value: unknown): string | null {
  if (typeof value === "string" && value.startsWith("sub_")) return value;
  if (value && typeof value === "object") {
    const id = (value as UnknownRecord).id;
    if (typeof id === "string" && id.startsWith("sub_")) return id;
  }
  return null;
}

/**
 * Collect every product id referenced by a subscription's items.
 * Works with both expanded price objects and plain string product refs.
 */
export function getSubscriptionProductIds(subscription: UnknownRecord | null | undefined): string[] {
  const items: UnknownRecord[] = subscription?.items?.data ?? [];
  const ids = new Set<string>();
  for (const item of items) {
    const product = item?.price?.product ?? item?.plan?.product;
    if (typeof product === "string" && product) ids.add(product);
    else if (product && typeof product === "object" && typeof product.id === "string") ids.add(product.id);
  }
  return [...ids];
}

/** Collect every price id referenced by a subscription's items. */
export function getSubscriptionPriceIds(subscription: UnknownRecord | null | undefined): string[] {
  const items: UnknownRecord[] = subscription?.items?.data ?? [];
  const ids = new Set<string>();
  for (const item of items) {
    const priceId = typeof item?.price === "string" ? item.price : item?.price?.id ?? item?.plan?.id;
    if (typeof priceId === "string" && priceId) ids.add(priceId);
  }
  return [...ids];
}

/**
 * A subscription belongs to the membership when it references the membership
 * PRODUCT. Scoping by product (not by the current price) keeps legacy $9.99
 * subscribers entitled after the price change.
 *
 * FAILS CLOSED: when the membership product is unknown this throws, because
 * accepting every subscription would entitle unrelated purchases. Callers must
 * treat the throw as a retryable configuration error and never revoke access.
 */
export function isMembershipSubscription(
  subscription: UnknownRecord | null | undefined,
  membershipProductId: string | null,
): boolean {
  if (!membershipProductId) {
    throw new Error("Membership product id is unknown - cannot classify subscription (retryable config error)");
  }
  return getSubscriptionProductIds(subscription).includes(membershipProductId);
}

/** True when the subscription is set to end at the current period end. */
export function isCancelScheduled(subscription: UnknownRecord | null | undefined): boolean {
  return subscription?.cancel_at_period_end === true || typeof subscription?.cancel_at === "number";
}

/**
 * Entitlement fields to persist after an AUTHORITATIVE read of Stripe state.
 * Never call this for transport/parse errors — see `shouldRevokeOnError`.
 */
export function buildEntitlementUpdate(subscription: UnknownRecord): {
  subscription_active: boolean;
  subscription_status: string;
  subscription_current_period_end: number | null;
  is_member: boolean;
  stripe_subscription_id: string | null;
} {
  const active = isActiveStatus(subscription?.status);
  return {
    subscription_active: active,
    subscription_status: String(subscription?.status ?? "unknown"),
    subscription_current_period_end: getSubscriptionPeriodEnd(subscription),
    is_member: active,
    stripe_subscription_id: typeof subscription?.id === "string" ? subscription.id : null,
  };
}

/**
 * Access granted by an admin (no Stripe subscription behind it) must never be
 * revoked by Stripe reconciliation. Current data uses
 * subscription_status = 'premium' with subscription_active = true and no
 * stripe_subscription_id.
 */
export function isGrantedPremium(profile: UnknownRecord | null | undefined): boolean {
  if (!profile) return false;
  return profile.subscription_active === true &&
    profile.subscription_status === "premium" &&
    !profile.stripe_subscription_id;
}

/**
 * Only a definitive "this subscription does not exist" answer from Stripe may
 * revoke access. Transport failures, rate limits, 5xx and parse errors must
 * preserve the last confirmed DB state and surface a retryable error.
 */
export function shouldRevokeOnError(error: UnknownRecord | null | undefined): boolean {
  if (!error) return false;
  const status = error.statusCode ?? error.status;
  const code = error.code;
  const type = error.type;
  if (code === "resource_missing") return true;
  if (type === "StripeInvalidRequestError" && status === 404) return true;
  return false;
}
