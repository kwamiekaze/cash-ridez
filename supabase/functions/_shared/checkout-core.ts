/**
 * Membership checkout logic, dependency-injected for unit testing.
 *
 * Guarantees:
 *  - Never sells a second membership to a user whose subscription is active,
 *    trialing, past_due, unpaid or incomplete (those may still renew). Those
 *    users are pointed at the billing portal to fix payment instead.
 *  - Reuses an already-open membership Checkout Session instead of creating a
 *    new one, and serializes concurrent requests per user with a DB lock, so
 *    minute-boundary races cannot open several checkouts.
 *  - Validates the configured price is active AND recurring.
 *  - Only exact app origins are accepted as return URLs.
 */

import { isGrantedPremium, type UnknownRecord } from "./stripe-compat.ts";
import {
  hasRenewableMembership,
  loadProfileOrThrow,
  pickCurrentMembership,
  listAllSubscriptions,
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

const isMissingRpc = (error: any) =>
  error?.code === "42883" || error?.code === "PGRST202" ||
  /could not find the function|does not exist/i.test(String(error?.message ?? ""));

/** Per-user serialization. Returns false when another request holds the lock. */
export async function acquireCheckoutLock(supabase: any, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_checkout_slot", {
    p_user_id: userId,
    p_ttl_seconds: 60,
  });
  if (error) {
    if (isMissingRpc(error)) {
      console.warn("[CHECKOUT] claim_checkout_slot RPC missing — pending migration not applied");
      return true;
    }
    throw new RetryableBillingError(`Checkout lock failed: ${error.message}`);
  }
  return data !== false;
}

export async function releaseCheckoutLock(supabase: any, userId: string): Promise<void> {
  const { error } = await supabase.rpc("release_checkout_slot", { p_user_id: userId });
  if (error && !isMissingRpc(error)) {
    console.error("[CHECKOUT] Failed to release checkout lock:", error.message);
  }
}

/** Find an already-open membership checkout session for this customer. */
export async function findOpenMembershipSession(
  stripe: any,
  customerId: string,
  priceId: string,
): Promise<any | null> {
  let list: any;
  try {
    list = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 20 });
  } catch (err) {
    throw new RetryableBillingError(`Session list failed: ${(err as any)?.message ?? err}`);
  }
  const now = Math.floor(Date.now() / 1000);
  for (const session of list?.data ?? []) {
    if (session?.mode !== "subscription") continue;
    if (typeof session?.expires_at === "number" && session.expires_at <= now) continue;
    if (!session?.url) continue;
    const lineItems: any[] = session?.line_items?.data ?? [];
    const matches = lineItems.length === 0 ||
      lineItems.some((item) => (typeof item?.price === "string" ? item.price : item?.price?.id) === priceId);
    if (matches) return session;
  }
  return null;
}

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

  let price: any;
  try {
    price = await deps.stripe.prices.retrieve(priceId);
  } catch (err) {
    throw new MembershipConfigError(`Membership price ${priceId} could not be loaded: ${(err as any)?.message}`);
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

  const locked = await acquireCheckoutLock(deps.supabase, user.id);
  if (!locked) {
    return {
      status: 409,
      body: {
        error: "A checkout is already in progress. Please finish or close the other tab.",
        code: "checkout_in_progress",
      },
    };
  }

  try {
    const customerId = await resolveCustomerForUser(deps.stripe, deps.supabase, user, profile, {
      createIfMissing: true,
    });
    if (!customerId) throw new RetryableBillingError("Could not resolve a Stripe customer");

    const subscriptions = await listAllSubscriptions(deps.stripe, customerId);
    const membership = pickCurrentMembership(subscriptions, membershipProductId);
    if (hasRenewableMembership(membership)) {
      return {
        status: 409,
        body: {
          error: membership.status === "active" || membership.status === "trialing"
            ? "You already have an active membership."
            : "You already have a membership that needs payment. Use Manage Billing to fix it.",
          code: "already_subscribed",
          subscription_status: membership.status,
          manage_billing: true,
        },
      };
    }

    const existingSession = await findOpenMembershipSession(deps.stripe, customerId, priceId);
    if (existingSession) {
      console.log("[CHECKOUT] Reusing open session for user", user.id);
      return { status: 200, body: { url: existingSession.url, reused: true } };
    }

    const successUrl = safeReturnUrl(
      request.successUrl,
      origin,
      "/billing/success?session_id={CHECKOUT_SESSION_ID}",
    );
    const cancelUrl = safeReturnUrl(request.cancelUrl, origin, "/billing/cancelled");

    const session = await deps.stripe.checkout.sessions.create(
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
      { idempotencyKey: `checkout:${user.id}:${priceId}` },
    );

    const { error: logError } = await deps.supabase.from("billing_logs").insert({
      user_id: user.id,
      event_type: "checkout_session_created",
      request_body: { priceId },
      response_body: { sessionId: session.id },
    });
    if (logError) console.error("[CHECKOUT] Failed to log billing event:", logError.message);

    return { status: 200, body: { url: session.url } };
  } finally {
    await releaseCheckoutLock(deps.supabase, user.id);
  }
}
