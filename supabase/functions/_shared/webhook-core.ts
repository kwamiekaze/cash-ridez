/**
 * Stripe webhook processing, written against injected `stripe` / `supabase`
 * shapes so the real branching behaviour is unit testable.
 *
 * Guarantees:
 *  - Unhandled event types return 200 immediately, BEFORE any membership
 *    config resolution (an unrelated event can never 5xx on our config).
 *  - Event receipt is claimed with a LEASE and a fencing token. A crashed
 *    process cannot leave an event stuck in `processing` forever: the lease
 *    expires and the next delivery reclaims it. An event already `succeeded`
 *    returns 200; an event actively being processed returns 503 so Stripe
 *    retries instead of silently dropping the delivery.
 *  - EVERY terminal path — including every skip/info path — closes the receipt
 *    atomically with its log. Nothing is left in `processing`.
 *  - Entitlement + notification + log + receipt completion happen in ONE
 *    transaction, ordered by a DB-monotonic generation reserved BEFORE the
 *    authoritative Stripe read (never by the event timestamp, which ties for
 *    same-second events), and guarded by the expected customer mapping.
 *  - There is NO non-atomic fallback. A missing RPC is a 503 dependency error.
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
  isMissingRpc,
  listAllSubscriptions,
  MissingDependencyError,
  parseApplyResult,
  pickCurrentMembership,
  reserveSyncGeneration,
  RetryableBillingError,
  type ApplyResult,
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

/** How long one delivery may hold the event before another may reclaim it. */
export const EVENT_LEASE_SECONDS = 120;

const ok = (extra: UnknownRecord = {}): WebhookResult => ({
  status: 200,
  body: { received: true, ...extra },
});

const retry = (reason: string, status = 500): WebhookResult => ({
  status,
  body: { error: "Processing failed", reason },
});

// ---------------------------------------------------------------------------
// Atomic event receipt (lease + fencing token)
// ---------------------------------------------------------------------------

export type ClaimOutcome = "claimed" | "reclaimed" | "succeeded" | "processing";

export interface EventClaim {
  outcome: ClaimOutcome;
  token: string | null;
}

export async function claimEvent(
  supabase: any,
  eventId: string,
  eventType: string,
): Promise<EventClaim> {
  const { data, error } = await supabase.rpc("claim_billing_event", {
    p_event_id: eventId,
    p_event_type: eventType,
    p_lease_seconds: EVENT_LEASE_SECONDS,
  });
  if (error) {
    if (isMissingRpc(error)) throw new MissingDependencyError("claim_billing_event");
    throw new RetryableBillingError(`Event claim failed: ${error.message}`);
  }
  // A null/boolean answer is NOT a success signal — validate the shape.
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new RetryableBillingError("claim_billing_event returned a malformed result");
  }
  const outcome = data.outcome as ClaimOutcome;
  if (!["claimed", "reclaimed", "succeeded", "processing"].includes(String(outcome))) {
    throw new RetryableBillingError(`claim_billing_event returned unknown outcome ${outcome}`);
  }
  if ((outcome === "claimed" || outcome === "reclaimed") && typeof data.token !== "string") {
    throw new RetryableBillingError("claim_billing_event granted a claim without a token");
  }
  return { outcome, token: typeof data.token === "string" ? data.token : null };
}

/** Release a claim so Stripe's retry can reprocess the event. */
export async function releaseEvent(
  supabase: any,
  eventId: string,
  token: string,
  message: string,
): Promise<void> {
  const { error } = await supabase.rpc("release_billing_event", {
    p_event_id: eventId,
    p_claim_token: token,
    p_error_message: message.slice(0, 500),
  });
  if (error) {
    console.error("[WEBHOOK] Failed to release event claim:", error.message);
  }
}

/**
 * Close the receipt for a terminal path that changes no entitlement.
 * This is atomic with the log insert, so a skip can never leave the event in
 * `processing` (which would swallow every later retry of that event).
 */
export async function completeEvent(
  supabase: any,
  args: {
    eventId: string;
    token: string;
    eventType: string;
    userId: string | null;
    log: UnknownRecord;
  },
): Promise<void> {
  const { data, error } = await supabase.rpc("complete_billing_event", {
    p_event_id: args.eventId,
    p_claim_token: args.token,
    p_event_type: args.eventType,
    p_user_id: args.userId,
    p_log: args.log,
  });
  if (error) {
    if (isMissingRpc(error)) throw new MissingDependencyError("complete_billing_event");
    throw new RetryableBillingError(`Event completion failed: ${error.message}`);
  }
  if (!data || typeof data !== "object" || data.completed !== true) {
    throw new RetryableBillingError("complete_billing_event did not confirm completion");
  }
}

/**
 * Commit entitlement + optional notification + log + receipt completion in one
 * transaction, fenced by the claim token and ordered by `generation`.
 */
export async function commitEntitlement(
  supabase: any,
  args: {
    eventId: string;
    token: string;
    eventType: string;
    userId: string;
    entitlement: UnknownRecord | null;
    generation: number;
    expectedCustomerId: string;
    notification?: UnknownRecord | null;
    log?: UnknownRecord;
  },
): Promise<ApplyResult> {
  const { data, error } = await supabase.rpc("apply_billing_entitlement", {
    p_event_id: args.eventId,
    p_claim_token: args.token,
    p_event_type: args.eventType,
    p_user_id: args.userId,
    p_entitlement: args.entitlement,
    p_generation: args.generation,
    p_expected_customer_id: args.expectedCustomerId,
    p_notification: args.notification ?? null,
    p_log: args.log ?? {},
  });

  if (error) {
    if (isMissingRpc(error)) throw new MissingDependencyError("apply_billing_entitlement");
    throw new RetryableBillingError(`Entitlement commit failed: ${error.message}`);
  }

  return parseApplyResult(data, "apply_billing_entitlement");
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
 *     profile has no conflicting customer id already stored, and the write is
 *     conditional on that (affected rows are checked).
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
    const { data, error } = await deps.supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", claimed)
      .is("stripe_customer_id", null)
      .select("id");
    if (error) throw new RetryableBillingError(`Customer link failed: ${error.message}`);
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    if (rows.length !== 1) {
      // Someone bound a different customer between our read and write.
      console.warn("[WEBHOOK] Concurrent customer binding for profile", claimed);
      return null;
    }
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

  // 2. Atomic dedupe with a lease.
  let claim: EventClaim;
  try {
    claim = await claimEvent(deps.supabase, event.id, event.type);
  } catch (err) {
    console.error("[WEBHOOK] Claim error:", (err as any)?.message);
    const status = err instanceof MissingDependencyError ? 503 : 500;
    return retry("claim_failed", status);
  }

  if (claim.outcome === "succeeded") return ok({ duplicate: true });
  if (claim.outcome === "processing") {
    // Another delivery holds a live lease. Ask Stripe to retry rather than
    // acknowledging an event we have not actually handled.
    return retry("event_in_progress", 503);
  }

  const token = claim.token as string;

  try {
    const result = await processClaimedEvent(deps, event, token);
    if (result.status >= 400) {
      await releaseEvent(deps.supabase, event.id, token, String(result.body?.reason ?? "failed"));
    }
    return result;
  } catch (err) {
    const message = (err as any)?.message ?? String(err);
    console.error(`[WEBHOOK] ${event.type} (${event.id}) failed: ${message}`);
    await releaseEvent(deps.supabase, event.id, token, message);
    const name = (err as any)?.name;
    const status = name === "MembershipConfigError" || name === "MissingDependencyError" ? 503 : 500;
    return { status, body: { error: "Processing failed" } };
  }
}

async function processClaimedEvent(
  deps: WebhookDeps,
  event: any,
  token: string,
): Promise<WebhookResult> {
  const customerId = customerIdFromEvent(event);

  if (event.type === "customer.created") {
    const object = event.data.object;
    const userId = object?.metadata?.supabase_user_id;
    if (!userId) {
      await completeEvent(deps.supabase, {
        eventId: event.id,
        token,
        eventType: event.type,
        userId: null,
        log: { customerId: object?.id, skipped: "no_metadata_user" },
      });
      return ok({ linked: false });
    }
    const profile = await profileById(deps.supabase, userId);
    if (!profile) return retry("profile_not_linked_yet", 503);
    const existing = profile.stripe_customer_id;
    if (typeof existing === "string" && existing && existing !== object.id) {
      await completeEvent(deps.supabase, {
        eventId: event.id,
        token,
        eventType: event.type,
        userId: profile.id as string,
        log: { customerId: object.id, skipped: "customer_conflict" },
      });
      return ok({ skipped: "customer_conflict" });
    }
    if (!existing) {
      const { data, error } = await deps.supabase
        .from("profiles")
        .update({ stripe_customer_id: object.id })
        .eq("id", userId)
        .is("stripe_customer_id", null)
        .select("id");
      if (error) throw new RetryableBillingError(`Customer id update failed: ${error.message}`);
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      if (rows.length !== 1) return retry("customer_binding_conflict", 503);
    }
    await completeEvent(deps.supabase, {
      eventId: event.id,
      token,
      eventType: event.type,
      userId,
      log: { customerId: object.id, linked: true },
    });
    return ok({ linked: true });
  }

  if (!customerId) {
    await completeEvent(deps.supabase, {
      eventId: event.id,
      token,
      eventType: event.type,
      userId: null,
      log: { skipped: "no_customer" },
    });
    return ok({ skipped: "no_customer" });
  }

  // Membership config is only needed for entitlement-bearing events.
  const membershipProductId = await deps.resolveMembershipProductId();

  const profile = await resolveProfileForCustomer(deps, customerId, metadataUserIdFromEvent(event));
  if (!profile) {
    // Do NOT mark the event processed — the profile may be linked momentarily.
    return retry("profile_not_linked_yet", 503);
  }

  const profileCustomerId = typeof profile.stripe_customer_id === "string"
    ? profile.stripe_customer_id
    : null;
  if (profileCustomerId !== customerId) {
    // The event's customer is not the one this profile trusts. Never write.
    return retry("customer_mapping_mismatch", 503);
  }

  const userId = profile.id as string;

  // Non-subscription invoices / one-off checkouts carry no membership signal.
  if (event.type === "invoice.payment_succeeded" || event.type === "invoice.payment_failed") {
    if (!getInvoiceSubscriptionId(event.data.object)) {
      await completeEvent(deps.supabase, {
        eventId: event.id,
        token,
        eventType: event.type,
        userId,
        log: { invoiceId: event.data.object?.id, skipped: "non_subscription_invoice" },
      });
      return ok({ skipped: "non_subscription_invoice" });
    }
  }
  if (
    (event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded") &&
    !event.data.object?.subscription
  ) {
    await completeEvent(deps.supabase, {
      eventId: event.id,
      token,
      eventType: event.type,
      userId,
      log: { sessionId: event.data.object?.id, skipped: "non_subscription_checkout" },
    });
    return ok({ skipped: "non_subscription_checkout" });
  }

  // Admin grants are never touched by Stripe reconciliation.
  if (isGrantedPremium(profile)) {
    await completeEvent(deps.supabase, {
      eventId: event.id,
      token,
      eventType: event.type,
      userId,
      log: { skipped: "granted_premium" },
    });
    return ok({ skipped: "granted_premium" });
  }

  // Reserve ordering BEFORE the authoritative Stripe read, so a slow older
  // invocation cannot overwrite a newer observation. Never event.created.
  const generation = await reserveSyncGeneration(deps.supabase, userId);

  // Authoritative CURRENT membership across every subscription page.
  const subscriptions = await listAllSubscriptions(deps.stripe, customerId);
  const membership = pickCurrentMembership(subscriptions, membershipProductId);

  if (!membership) {
    if (!profile.subscription_active && !profile.stripe_subscription_id) {
      await completeEvent(deps.supabase, {
        eventId: event.id,
        token,
        eventType: event.type,
        userId,
        log: { skipped: "no_membership" },
      });
      return ok({ skipped: "no_membership" });
    }
    const commit = await commitEntitlement(deps.supabase, {
      eventId: event.id,
      token,
      eventType: event.type,
      userId,
      generation,
      expectedCustomerId: customerId,
      entitlement: {
        subscription_active: false,
        subscription_status: "canceled",
        is_member: false,
        stripe_subscription_id: null,
      },
      log: { revoked: true },
    });
    return ok({ revoked: commit.applied, stale: commit.stale, granted: commit.granted });
  }

  const entitlement = buildEntitlementUpdate(membership, membershipProductId);

  const notification = event.type === "invoice.payment_failed" && !entitlement.subscription_active
    ? {
      p_user_id: userId,
      p_type: "payment_failed",
      p_title: "Payment Failed",
      p_message:
        "Your unlimited access payment failed. Please update your payment method to restore access.",
      p_link: "/subscription",
    }
    : null;

  const commit = await commitEntitlement(deps.supabase, {
    eventId: event.id,
    token,
    eventType: event.type,
    userId,
    generation,
    expectedCustomerId: customerId,
    entitlement,
    notification,
    log: { subscriptionId: membership.id, status: membership.status },
  });

  return ok({
    applied: commit.applied,
    stale: commit.stale,
    granted: commit.granted,
    status: entitlement.subscription_status,
  });
}
