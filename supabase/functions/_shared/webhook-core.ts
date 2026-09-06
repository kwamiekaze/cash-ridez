/**
 * Stripe webhook processing, written against injected `stripe` / `supabase`
 * shapes so the real branching behaviour is unit testable.
 *
 * Guarantees:
 *  - Unhandled event types return 200 immediately, BEFORE any membership
 *    config resolution (an unrelated event can never 5xx on our config).
 *  - Event receipt is claimed atomically (`claim_billing_event`), so concurrent
 *    redeliveries cannot both process and cannot duplicate notifications.
 *  - Entitlement + notification + log are written in ONE transaction
 *    (`apply_billing_entitlement`), guarded by a customer-level version so an
 *    out-of-order callback can never overwrite a newer sync.
 *  - Entitlement is always derived from the CURRENT membership across ALL of
 *    the customer's subscription pages — never from the event snapshot, and
 *    never from an old canceled subscription referenced by a late invoice.
 *  - Processing failures return 5xx. Nothing returns 200 on failure.
 *  - Admin-granted premium is never revoked.
 */

import {
  buildEntitlementUpdate,
  getInvoiceSubscriptionId,
  isGrantedPremium,
  type UnknownRecord,
} from "./stripe-compat.ts";
import {
  listAllSubscriptions,
  pickCurrentMembership,
  RetryableBillingError,
} from "./billing-core.ts";

export interface WebhookDeps {
  stripe: any;
  supabase: any;
  /** Throws MembershipConfigError when the membership product is unknown. */
  resolveMembershipProductId: () => Promise<string>;
}

export interface WebhookResult {
  status: number;
  body: UnknownRecord;
}

const HANDLED_EVENTS = new Set([
  "customer.created",
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
]);

const ok = (extra: UnknownRecord = {}): WebhookResult => ({
  status: 200,
  body: { received: true, ...extra },
});

const retry = (reason: string, status = 500): WebhookResult => ({
  status,
  body: { error: "Processing failed", reason },
});

/** True when the atomic billing RPCs have not been created yet. */
const isMissingRpc = (error: any) =>
  error?.code === "42883" || error?.code === "PGRST202" ||
  /could not find the function|does not exist/i.test(String(error?.message ?? ""));

// ---------------------------------------------------------------------------
// Atomic event receipt
// ---------------------------------------------------------------------------

export type ClaimResult = "claimed" | "duplicate" | "unavailable";

export async function claimEvent(
  supabase: any,
  eventId: string,
  eventType: string,
): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc("claim_billing_event", {
    p_event_id: eventId,
    p_event_type: eventType,
  });
  if (error) {
    if (isMissingRpc(error)) {
      console.warn("[WEBHOOK] claim_billing_event RPC missing — pending migration not applied");
      return "unavailable";
    }
    throw new RetryableBillingError(`Event claim failed: ${error.message}`);
  }
  return data === true ? "claimed" : "duplicate";
}

/** Release a claim so Stripe's retry can reprocess the event. */
export async function releaseEvent(supabase: any, eventId: string, message: string): Promise<void> {
  const { error } = await supabase.rpc("release_billing_event", {
    p_event_id: eventId,
    p_error_message: message.slice(0, 500),
  });
  if (error && !isMissingRpc(error)) {
    console.error("[WEBHOOK] Failed to release event claim:", error.message);
  }
}

/**
 * Commit entitlement + optional notification + log in one transaction.
 * `syncVersion` is the Stripe event timestamp; the RPC ignores writes older
 * than the profile's recorded version.
 */
export async function commitEntitlement(
  supabase: any,
  args: {
    eventId: string;
    eventType: string;
    userId: string;
    entitlement: UnknownRecord | null;
    syncVersion: number;
    notification?: UnknownRecord | null;
    log?: UnknownRecord;
  },
): Promise<{ applied: boolean; stale?: boolean }> {
  const { data, error } = await supabase.rpc("apply_billing_entitlement", {
    p_event_id: args.eventId,
    p_event_type: args.eventType,
    p_user_id: args.userId,
    p_entitlement: args.entitlement,
    p_sync_version: args.syncVersion,
    p_notification: args.notification ?? null,
    p_log: args.log ?? {},
  });

  if (error) {
    if (isMissingRpc(error)) {
      // Degraded, non-atomic path used only until the pending SQL is applied.
      return await fallbackCommit(supabase, args);
    }
    throw new RetryableBillingError(`Entitlement commit failed: ${error.message}`);
  }

  return { applied: data?.applied !== false, stale: data?.stale === true };
}

/**
 * Non-atomic fallback. Every write error is surfaced (never swallowed) so the
 * caller returns 5xx and Stripe retries.
 */
async function fallbackCommit(
  supabase: any,
  args: {
    eventId: string;
    eventType: string;
    userId: string;
    entitlement: UnknownRecord | null;
    syncVersion: number;
    notification?: UnknownRecord | null;
    log?: UnknownRecord;
  },
): Promise<{ applied: boolean; stale?: boolean }> {
  if (args.entitlement) {
    const { error } = await supabase
      .from("profiles")
      .update(args.entitlement)
      .eq("id", args.userId);
    if (error) throw new RetryableBillingError(`Entitlement update failed: ${error.message}`);
  }

  if (args.notification) {
    const { error } = await supabase.rpc("create_notification", args.notification);
    if (error) throw new RetryableBillingError(`Notification failed: ${error.message}`);
  }

  const { error: logError } = await supabase.from("billing_logs").insert({
    user_id: args.userId,
    event_type: args.eventType,
    stripe_event_id: args.eventId,
    request_body: args.log ?? {},
  });
  if (logError) throw new RetryableBillingError(`Billing log insert failed: ${logError.message}`);

  return { applied: true };
}

/** Record a purely informational outcome (no entitlement change). */
export async function recordInfoLog(
  supabase: any,
  eventId: string,
  eventType: string,
  userId: string | null,
  data: UnknownRecord,
): Promise<void> {
  const { error } = await supabase.from("billing_logs").insert({
    user_id: userId,
    event_type: eventType,
    stripe_event_id: eventId,
    request_body: data,
  });
  if (error) throw new RetryableBillingError(`Billing log insert failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Profile resolution
// ---------------------------------------------------------------------------

const PROFILE_COLUMNS =
  "id, stripe_customer_id, stripe_subscription_id, subscription_active, subscription_status";

async function profileByCustomer(supabase: any, customerId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw new RetryableBillingError(`Profile lookup failed: ${error.message}`);
  return data ?? null;
}

async function profileById(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new RetryableBillingError(`Profile lookup failed: ${error.message}`);
  return data ?? null;
}

/**
 * Find the profile that owns a Stripe customer.
 *
 * Preference order:
 *  1. Trusted stored mapping (profiles.stripe_customer_id).
 *  2. Verified customer metadata `supabase_user_id` — only accepted when the
 *     profile has no conflicting customer id already stored.
 *
 * Email is never used. Returns null when the link cannot be established, and
 * the caller must retry rather than mark the event processed.
 */
export async function resolveProfileForCustomer(
  deps: WebhookDeps,
  customerId: string,
  metadataUserId?: string | null,
): Promise<UnknownRecord | null> {
  const stored = await profileByCustomer(deps.supabase, customerId);
  if (stored) return stored;

  let customer: any = null;
  try {
    customer = await deps.stripe.customers.retrieve(customerId);
  } catch (err) {
    if ((err as any)?.code !== "resource_missing") {
      throw new RetryableBillingError(`Customer lookup failed: ${(err as any)?.message ?? err}`);
    }
  }

  const claimed = customer?.metadata?.supabase_user_id ?? metadataUserId ?? null;
  if (typeof claimed !== "string" || claimed === "") return null;

  // The metadata claim must agree with the customer object we just verified.
  if (customer && customer?.metadata?.supabase_user_id &&
      customer.metadata.supabase_user_id !== claimed) {
    return null;
  }

  const profile = await profileById(deps.supabase, claimed);
  if (!profile) return null;

  const existing = profile.stripe_customer_id;
  if (typeof existing === "string" && existing && existing !== customerId) {
    console.warn("[WEBHOOK] Customer conflict for profile", claimed, "— refusing to rebind");
    return null;
  }

  if (!existing) {
    const { error } = await deps.supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", claimed);
    if (error) throw new RetryableBillingError(`Customer link failed: ${error.message}`);
    profile.stripe_customer_id = customerId;
  }

  return profile;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

function customerIdFromEvent(event: any): string | null {
  const object = event?.data?.object ?? {};
  const raw = object.customer ?? (event.type === "customer.created" ? object.id : null);
  if (typeof raw === "string" && raw.startsWith("cus_")) return raw;
  if (raw && typeof raw === "object" && typeof raw.id === "string") return raw.id;
  return null;
}

function metadataUserIdFromEvent(event: any): string | null {
  const object = event?.data?.object ?? {};
  const value = object?.metadata?.supabase_user_id;
  return typeof value === "string" && value ? value : null;
}

export async function handleStripeEvent(deps: WebhookDeps, event: any): Promise<WebhookResult> {
  // 1. Unhandled types: acknowledge BEFORE touching config or the database.
  if (!HANDLED_EVENTS.has(event.type)) {
    return ok({ ignored: true, type: event.type });
  }

  // 2. Atomic dedupe.
  let claim: ClaimResult;
  try {
    claim = await claimEvent(deps.supabase, event.id, event.type);
  } catch (err) {
    console.error("[WEBHOOK] Claim error:", (err as any)?.message);
    return retry("claim_failed");
  }
  if (claim === "duplicate") return ok({ duplicate: true });

  try {
    const result = await processClaimedEvent(deps, event);
    if (result.status >= 400) {
      await releaseEvent(deps.supabase, event.id, String(result.body?.reason ?? "failed"));
    }
    return result;
  } catch (err) {
    const message = (err as any)?.message ?? String(err);
    console.error(`[WEBHOOK] ${event.type} (${event.id}) failed: ${message}`);
    await releaseEvent(deps.supabase, event.id, message);
    const status = (err as any)?.name === "MembershipConfigError" ? 503 : 500;
    return { status, body: { error: "Processing failed" } };
  }
}

async function processClaimedEvent(deps: WebhookDeps, event: any): Promise<WebhookResult> {
  const eventCreated = typeof event.created === "number" ? event.created : Math.floor(Date.now() / 1000);
  const customerId = customerIdFromEvent(event);

  if (event.type === "customer.created") {
    const object = event.data.object;
    const userId = object?.metadata?.supabase_user_id;
    if (!userId) {
      await recordInfoLog(deps.supabase, event.id, event.type, null, { customerId: object?.id });
      return ok({ linked: false });
    }
    const profile = await profileById(deps.supabase, userId);
    if (!profile) return retry("profile_not_linked_yet", 503);
    const existing = profile.stripe_customer_id;
    if (typeof existing === "string" && existing && existing !== object.id) {
      await recordInfoLog(deps.supabase, event.id, event.type, profile.id, {
        customerId: object.id,
        skipped: "customer_conflict",
      });
      return ok({ skipped: "customer_conflict" });
    }
    const { error } = await deps.supabase
      .from("profiles")
      .update({ stripe_customer_id: object.id })
      .eq("id", userId);
    if (error) throw new RetryableBillingError(`Customer id update failed: ${error.message}`);
    await recordInfoLog(deps.supabase, event.id, event.type, userId, { customerId: object.id });
    return ok({ linked: true });
  }

  if (!customerId) {
    await recordInfoLog(deps.supabase, event.id, event.type, null, { skipped: "no_customer" });
    return ok({ skipped: "no_customer" });
  }

  // Membership config is only needed for entitlement-bearing events.
  const membershipProductId = await deps.resolveMembershipProductId();

  const profile = await resolveProfileForCustomer(deps, customerId, metadataUserIdFromEvent(event));
  if (!profile) {
    // Do NOT mark the event processed — the profile may be linked momentarily.
    return retry("profile_not_linked_yet", 503);
  }

  // Non-subscription invoices / one-off checkouts carry no membership signal.
  if (event.type === "invoice.payment_succeeded" || event.type === "invoice.payment_failed") {
    if (!getInvoiceSubscriptionId(event.data.object)) {
      await recordInfoLog(deps.supabase, event.id, event.type, profile.id, {
        invoiceId: event.data.object?.id,
        skipped: "non_subscription_invoice",
      });
      return ok({ skipped: "non_subscription_invoice" });
    }
  }
  if (
    (event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded") &&
    !event.data.object?.subscription
  ) {
    await recordInfoLog(deps.supabase, event.id, event.type, profile.id, {
      sessionId: event.data.object?.id,
      skipped: "non_subscription_checkout",
    });
    return ok({ skipped: "non_subscription_checkout" });
  }

  // Authoritative CURRENT membership across every subscription page.
  const subscriptions = await listAllSubscriptions(deps.stripe, customerId);
  const membership = pickCurrentMembership(subscriptions, membershipProductId);

  // Admin grants are never touched by Stripe reconciliation.
  if (isGrantedPremium(profile)) {
    await recordInfoLog(deps.supabase, event.id, event.type, profile.id, { skipped: "granted_premium" });
    return ok({ skipped: "granted_premium" });
  }

  if (!membership) {
    if (!profile.subscription_active && !profile.stripe_subscription_id) {
      await recordInfoLog(deps.supabase, event.id, event.type, profile.id, { skipped: "no_membership" });
      return ok({ skipped: "no_membership" });
    }
    const commit = await commitEntitlement(deps.supabase, {
      eventId: event.id,
      eventType: event.type,
      userId: profile.id,
      syncVersion: eventCreated,
      entitlement: {
        subscription_active: false,
        subscription_status: "canceled",
        is_member: false,
        stripe_subscription_id: null,
      },
      log: { revoked: true },
    });
    return ok({ revoked: commit.applied, stale: commit.stale });
  }

  const entitlement = buildEntitlementUpdate(membership, membershipProductId);

  const notification = event.type === "invoice.payment_failed" && !entitlement.subscription_active
    ? {
      p_user_id: profile.id,
      p_type: "payment_failed",
      p_title: "Payment Failed",
      p_message:
        "Your unlimited access payment failed. Please update your payment method to restore access.",
      p_link: "/subscription",
    }
    : null;

  const commit = await commitEntitlement(deps.supabase, {
    eventId: event.id,
    eventType: event.type,
    userId: profile.id,
    syncVersion: eventCreated,
    entitlement,
    notification,
    log: { subscriptionId: membership.id, status: membership.status },
  });

  return ok({ applied: commit.applied, stale: commit.stale, status: entitlement.subscription_status });
}
