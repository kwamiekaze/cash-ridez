/**
 * Membership checkout logic, dependency-injected for unit testing.
 *
 * Guarantees:
 *  - Never sells a second membership to a user whose subscription is active,
 *    trialing, past_due, unpaid, incomplete or paused (those may still renew).
 *    Those users are pointed at the billing portal instead.
 *  - Reuses an already-open membership Checkout Session instead of creating a
 *    new one. Candidate sessions are VERIFIED: their line items are retrieved
 *    (Stripe list responses do not include them) and must reference the exact
 *    configured price, and their metadata must name this user. An unverifiable
 *    session is never reused, so a new member can never be handed an old
 *    $9.99 session.
 *  - Concurrency is serialized per user with a DB lock that carries a random
 *    owner token: a stale request can only release the lock it still owns.
 *  - The Stripe idempotency key comes from a DURABLE per-user checkout attempt
 *    row, not a time bucket. It is reused for uncertain failures and rotated
 *    only once the attempt is definitively expired or completed.
 *  - An unknown REST outcome never causes a second attempt.
 *  - Validates the configured price is active AND recurring.
 *  - Only exact app origins are accepted as return URLs.
 *  - Missing atomic RPCs are a 503 dependency error: no Stripe customer or
 *    session is created and no entitlement is written.
 */

import { isGrantedPremium, type UnknownRecord } from "./stripe-compat.ts";
import {
  hasRenewableMembership,
  isMissingRpc,
  loadProfileOrThrow,
  MissingDependencyError,
  pickCurrentMembership,
  listAllSubscriptions,
  paginateStripe,
  resolveCustomerForUser,
  RetryableBillingError,
} from "./billing-core.ts";
import { MembershipConfigError, safeReturnUrl } from "./membership.ts";

export interface CheckoutDeps {
  stripe: any;
  supabase: any;
  /** Effective membership price id (app_config first, env fallback). */
  resolveMembershipPriceId: () => Promise<string>;
}

export interface CheckoutRequest {
  user: { id: string; email: string };
  origin: string;
  successUrl?: unknown;
  cancelUrl?: unknown;
}

export interface CheckoutResponse {
  status: number;
  body: UnknownRecord;
}

export const CHECKOUT_LOCK_TTL_SECONDS = 60;

// ---------------------------------------------------------------------------
// Per-user lock with a fencing owner token
// ---------------------------------------------------------------------------

export interface CheckoutLock {
  granted: boolean;
  token: string | null;
}

export function newLockToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Per-user serialization. The token is ours alone: an expired holder cannot
 * clear a lock that a newer request has since taken.
 */
export async function acquireCheckoutLock(supabase: any, userId: string): Promise<CheckoutLock> {
  const token = newLockToken();
  const { data, error } = await supabase.rpc("claim_checkout_slot", {
    p_user_id: userId,
    p_owner_token: token,
    p_ttl_seconds: CHECKOUT_LOCK_TTL_SECONDS,
  });
  if (error) {
    if (isMissingRpc(error)) throw new MissingDependencyError("claim_checkout_slot");
    throw new RetryableBillingError(`Checkout lock failed: ${error.message}`);
  }
  if (!data || typeof data !== "object" || typeof data.granted !== "boolean") {
    throw new RetryableBillingError("claim_checkout_slot returned a malformed result");
  }
  return { granted: data.granted, token: data.granted ? token : null };
}

/** Release ONLY when we still hold the lock under our own token. */
export async function releaseCheckoutLock(
  supabase: any,
  userId: string,
  token: string,
): Promise<void> {
  const { error } = await supabase.rpc("release_checkout_slot", {
    p_user_id: userId,
    p_owner_token: token,
  });
  if (error) {
    console.error("[CHECKOUT] Failed to release checkout lock:", error.message);
  }
}

// ---------------------------------------------------------------------------
// Durable checkout attempt (idempotency key lifecycle)
// ---------------------------------------------------------------------------

export interface CheckoutAttempt {
  /** Stripe idempotency key for this attempt. */
  key: string;
  /** Session id already recorded for this attempt, if any. */
  sessionId: string | null;
}

/**
 * Open (or resume) the durable attempt for this user + price.
 * The same key is returned while the attempt is unresolved, so an uncertain
 * REST outcome can be retried safely instead of creating a second checkout.
 */
export async function beginCheckoutAttempt(
  supabase: any,
  userId: string,
  priceId: string,
): Promise<CheckoutAttempt> {
  const { data, error } = await supabase.rpc("begin_checkout_attempt", {
    p_user_id: userId,
    p_price_id: priceId,
  });
  if (error) {
    if (isMissingRpc(error)) throw new MissingDependencyError("begin_checkout_attempt");
    throw new RetryableBillingError(`Checkout attempt failed: ${error.message}`);
  }
  if (!data || typeof data !== "object" || typeof data.key !== "string" || !data.key) {
    throw new RetryableBillingError("begin_checkout_attempt returned a malformed result");
  }
  return {
    key: data.key,
    sessionId: typeof data.session_id === "string" ? data.session_id : null,
  };
}

/** Record the session produced by an attempt (idempotent). */
export async function recordCheckoutAttempt(
  supabase: any,
  userId: string,
  key: string,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase.rpc("record_checkout_attempt", {
    p_user_id: userId,
    p_key: key,
    p_session_id: sessionId,
  });
  if (error) {
    if (isMissingRpc(error)) throw new MissingDependencyError("record_checkout_attempt");
    throw new RetryableBillingError(`Checkout attempt record failed: ${error.message}`);
  }
}

/** Retire an attempt whose session is definitively expired or completed. */
export async function retireCheckoutAttempt(
  supabase: any,
  userId: string,
  key: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc("retire_checkout_attempt", {
    p_user_id: userId,
    p_key: key,
    p_reason: reason,
  });
  if (error) {
    if (isMissingRpc(error)) throw new MissingDependencyError("retire_checkout_attempt");
    throw new RetryableBillingError(`Checkout attempt retire failed: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Open-session reuse
// ---------------------------------------------------------------------------

function sessionPriceIds(session: any, lineItems: any[]): string[] {
  const ids = new Set<string>();
  for (const item of lineItems) {
    const priceId = typeof item?.price === "string" ? item.price : item?.price?.id;
    if (typeof priceId === "string" && priceId) ids.add(priceId);
  }
  const inline: any[] = session?.line_items?.data ?? [];
  for (const item of inline) {
    const priceId = typeof item?.price === "string" ? item.price : item?.price?.id;
    if (typeof priceId === "string" && priceId) ids.add(priceId);
  }
  return [...ids];
}

/**
 * Find an already-open membership checkout session for this customer.
 *
 * Stripe's session LIST omits `line_items`, so an empty list must never be read
 * as "this is the membership". Every candidate's line items are fetched and the
 * exact configured price is required.
 */
export async function findOpenMembershipSession(
  stripe: any,
  customerId: string,
  priceId: string,
  userId: string,
): Promise<any | null> {
  const sessions = await paginateStripe(
    "Session list",
    (startingAfter) =>
      stripe.checkout.sessions.list({
        customer: customerId,
        status: "open",
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }),
    (session: any, index: number) => {
      if (!session || typeof session !== "object") {
        throw new RetryableBillingError(`Session list: item ${index} is not an object`);
      }
      if (typeof session.id !== "string" || !session.id) {
        throw new RetryableBillingError(`Session list: item ${index} has no id`);
      }
    },
  );

  const now = Math.floor(Date.now() / 1000);

  for (const session of sessions) {
    if (session?.mode !== "subscription") continue;
    if (typeof session?.expires_at === "number" && session.expires_at <= now) continue;
    if (typeof session?.url !== "string" || !session.url) continue;
    // The session must be ours: metadata is written at creation time.
    if (session?.metadata?.supabase_user_id !== userId) continue;

    let lineItems: any[] = [];
    try {
      const list = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
      if (!list || typeof list !== "object" || !Array.isArray(list.data)) {
        throw new RetryableBillingError("Session line items: malformed response");
      }
      lineItems = list.data;
    } catch (err) {
      if (err instanceof RetryableBillingError) throw err;
      throw new RetryableBillingError(
        `Session line items failed: ${(err as any)?.message ?? err}`,
      );
    }

    const prices = sessionPriceIds(session, lineItems);
    if (prices.length === 0) continue; // unverifiable: never reuse
    if (prices.length === 1 && prices[0] === priceId) return session;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function createMembershipCheckout(
  deps: CheckoutDeps,
  request: CheckoutRequest,
): Promise<CheckoutResponse> {
  const { user, origin } = request;

  // A profile read error must abort — never continue and create a customer.
  const profile = await loadProfileOrThrow(deps.supabase, user.id);

  if (isGrantedPremium(profile)) {
    return {
      status: 409,
      body: { error: "You already have unlimited access.", code: "already_subscribed" },
    };
  }

  const priceId = await deps.resolveMembershipPriceId();

  // Acquire the lock BEFORE any Stripe mutation. A missing RPC throws
  // MissingDependencyError here, so nothing is created in Stripe.
  const lock = await acquireCheckoutLock(deps.supabase, user.id);
  if (!lock.granted) {
    return {
      status: 409,
      body: {
        error: "A checkout is already in progress. Please finish or close the other tab.",
        code: "checkout_in_progress",
      },
    };
  }
  const lockToken = lock.token as string;

  try {
    let price: any;
    try {
      price = await deps.stripe.prices.retrieve(priceId);
    } catch (err) {
      throw new MembershipConfigError(
        `Membership price ${priceId} could not be loaded: ${(err as any)?.message}`,
      );
    }
    if (!price?.active) {
      throw new MembershipConfigError(`Membership price ${priceId} is not active in Stripe`);
    }
    if (!price?.recurring) {
      throw new MembershipConfigError(`Membership price ${priceId} is not a recurring price`);
    }
    const membershipProductId = typeof price.product === "string" ? price.product : price.product?.id;
    if (!membershipProductId) {
      throw new MembershipConfigError(`Membership price ${priceId} has no product`);
    }

    const customerId = await resolveCustomerForUser(deps.stripe, deps.supabase, user, profile, {
      createIfMissing: true,
    });
    if (!customerId) throw new RetryableBillingError("Could not resolve a Stripe customer");

    const subscriptions = await listAllSubscriptions(deps.stripe, customerId);
    const membership = pickCurrentMembership(subscriptions, membershipProductId);
    if (hasRenewableMembership(membership)) {
      const live = membership.status === "active" || membership.status === "trialing";
      return {
        status: 409,
        body: {
          error: live
            ? "You already have an active membership."
            : membership.status === "paused"
            ? "Your membership is paused. Use Manage Billing to resume it."
            : "You already have a membership that needs payment. Use Manage Billing to fix it.",
          code: "already_subscribed",
          subscription_status: membership.status,
          manage_billing: true,
        },
      };
    }

    // Durable attempt: the idempotency key survives across requests.
    const attempt = await beginCheckoutAttempt(deps.supabase, user.id, priceId);

    // If this attempt already produced a session, resolve its real state before
    // deciding anything — never assume it is still usable.
    if (attempt.sessionId) {
      let recorded: any = null;
      try {
        recorded = await deps.stripe.checkout.sessions.retrieve(attempt.sessionId);
      } catch (err) {
        if ((err as any)?.code !== "resource_missing") {
          throw new RetryableBillingError(
            `Session lookup failed: ${(err as any)?.message ?? err}`,
          );
        }
      }
      if (recorded?.status === "open" && typeof recorded?.url === "string" && recorded.url) {
        return { status: 200, body: { url: recorded.url, reused: true } };
      }
      if (recorded?.status === "complete" || recorded?.status === "expired" || !recorded) {
        await retireCheckoutAttempt(
          deps.supabase,
          user.id,
          attempt.key,
          recorded?.status ?? "missing",
        );
        // A retired attempt needs a fresh key before creating anything.
        const rotated = await beginCheckoutAttempt(deps.supabase, user.id, priceId);
        attempt.key = rotated.key;
        attempt.sessionId = rotated.sessionId;
      } else {
        // Unknown/uncertain state: do NOT create a second checkout.
        throw new RetryableBillingError(
          `Existing checkout attempt is in an unresolved state (${recorded?.status ?? "unknown"})`,
        );
      }
    }

    const existingSession = await findOpenMembershipSession(
      deps.stripe,
      customerId,
      priceId,
      user.id,
    );
    if (existingSession) {
      console.log("[CHECKOUT] Reusing verified open session for user", user.id);
      await recordCheckoutAttempt(deps.supabase, user.id, attempt.key, existingSession.id);
      return { status: 200, body: { url: existingSession.url, reused: true } };
    }

    const successUrl = safeReturnUrl(
      request.successUrl,
      origin,
      "/billing/success?session_id={CHECKOUT_SESSION_ID}",
    );
    const cancelUrl = safeReturnUrl(request.cancelUrl, origin, "/billing/cancelled");

    let session: any;
    try {
      session = await deps.stripe.checkout.sessions.create(
        {
          customer: customerId,
          line_items: [{ price: priceId, quantity: 1 }],
          mode: "subscription",
          success_url: successUrl.includes("{CHECKOUT_SESSION_ID}")
            ? successUrl
            : `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: cancelUrl,
          metadata: { supabase_user_id: user.id },
          subscription_data: { metadata: { supabase_user_id: user.id } },
        },
        { idempotencyKey: attempt.key },
      );
    } catch (err) {
      // The attempt row keeps its key, so the retry reuses the same
      // idempotency key rather than opening a second checkout.
      throw new RetryableBillingError(
        `Checkout session creation failed: ${(err as any)?.message ?? err}`,
      );
    }

    if (typeof session?.id !== "string" || typeof session?.url !== "string" || !session.url) {
      throw new RetryableBillingError("Checkout session creation returned a malformed response");
    }

    await recordCheckoutAttempt(deps.supabase, user.id, attempt.key, session.id);

    const { error: logError } = await deps.supabase.from("billing_logs").insert({
      user_id: user.id,
      event_type: "checkout_session_created",
      request_body: { priceId },
      response_body: { sessionId: session.id },
    });
    if (logError) console.error("[CHECKOUT] Failed to log billing event:", logError.message);

    return { status: 200, body: { url: session.url } };
  } finally {
    await releaseCheckoutLock(deps.supabase, user.id, lockToken);
  }
}
