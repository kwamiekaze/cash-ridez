/**
 * Dependency-injected billing logic shared by the Stripe edge functions.
 *
 * Everything here is written against small `stripe` / `supabase` shaped
 * interfaces so the exact behaviour (not just leaf helpers) can be unit tested
 * with mocks outside the Deno runtime.
 *
 * Hard rules encoded here:
 *  - A Stripe customer is NEVER bound to a user by email alone. Only an exact
 *    `metadata.supabase_user_id` match, or an already-trusted stored mapping,
 *    may be used.
 *  - Any profile read/write error ABORTS. It never falls through to creating or
 *    recovering a customer, and never degrades into "free / 0 connections".
 *  - Transport/config errors never revoke entitlement.
 */

import {
  isActiveStatus,
  isMembershipSubscription,
  type UnknownRecord,
} from "./stripe-compat.ts";

/** Non-fatal-for-entitlement error: caller must retry, never revoke. */
export class RetryableBillingError extends Error {
  readonly retryable = true;
  constructor(message: string) {
    super(message);
    this.name = "RetryableBillingError";
  }
}

/** The customer could not be bound to this user unambiguously and safely. */
export class AmbiguousCustomerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmbiguousCustomerError";
  }
}

// ---------------------------------------------------------------------------
// Origins
// ---------------------------------------------------------------------------

/**
 * Exact allowlist. A suffix test like `.lovable.app` would accept ANY Lovable
 * project as a redirect target, so only this app's own hosts are accepted.
 */
export const APP_ORIGINS = [
  "https://cashridez.com",
  "https://www.cashridez.com",
  "https://cash-ridez.lovable.app",
  "https://id-preview--ef814ad2-4e30-43c4-ae0e-8a992beec2f3.lovable.app",
  "https://ef814ad2-4e30-43c4-ae0e-8a992beec2f3.lovableproject.com",
];

const DEV_ORIGINS = ["http://localhost:8080", "http://localhost:5173", "http://127.0.0.1:8080"];

/** Resolve a trusted app origin from the request Origin header. */
export function resolveAppOrigin(originHeader: string | null | undefined): string {
  const origin = (originHeader ?? "").trim();
  if (APP_ORIGINS.includes(origin)) return origin;
  if (DEV_ORIGINS.includes(origin)) return origin;
  return APP_ORIGINS[0];
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export const PROFILE_BILLING_COLUMNS =
  "id, stripe_customer_id, stripe_subscription_id, subscription_active, subscription_status, subscription_current_period_end, completed_trips_count, connected_trips_count";

/**
 * Load a profile by id. A query error OR a missing row is an abort condition —
 * callers must never continue with an assumed-empty profile.
 */
export async function loadProfileOrThrow(supabase: any, userId: string): Promise<UnknownRecord> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_BILLING_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new RetryableBillingError(`Profile lookup failed: ${error.message}`);
  if (!data) throw new RetryableBillingError(`Profile ${userId} not found`);
  return data;
}

/** Persist a profile patch, surfacing any write error. */
export async function updateProfileOrThrow(
  supabase: any,
  userId: string,
  patch: UnknownRecord,
): Promise<void> {
  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) throw new RetryableBillingError(`Profile update failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Customer resolution
// ---------------------------------------------------------------------------

/**
 * Verify that a stored customer id still belongs to this user.
 * A customer whose metadata names a DIFFERENT user is rejected outright.
 */
export async function verifyCustomerOwnership(
  stripe: any,
  customerId: string,
  userId: string,
): Promise<boolean> {
  let customer: any;
  try {
    customer = await stripe.customers.retrieve(customerId);
  } catch (err) {
    const code = (err as any)?.code;
    if (code === "resource_missing") return false;
    throw new RetryableBillingError(`Customer lookup failed: ${(err as any)?.message ?? err}`);
  }
  if (!customer || customer.deleted) return false;
  const owner = customer?.metadata?.supabase_user_id;
  if (typeof owner === "string" && owner !== "") return owner === userId;
  // Legacy customers created before metadata existed: trust ONLY because the id
  // came from our own profile row (already a trusted mapping).
  return true;
}

/**
 * Find the Stripe customer for a user WITHOUT ever matching on email alone.
 * Pages through the email results and requires an exact metadata match.
 * Multiple conflicting metadata matches -> AmbiguousCustomerError.
 */
export async function findCustomerByUserMetadata(
  stripe: any,
  email: string,
  userId: string,
): Promise<string | null> {
  const matches: string[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < 10; page++) {
    let list: any;
    try {
      list = await stripe.customers.list({
        email,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
    } catch (err) {
      throw new RetryableBillingError(`Customer search failed: ${(err as any)?.message ?? err}`);
    }
    const data: any[] = list?.data ?? [];
    for (const customer of data) {
      if (customer?.deleted) continue;
      if (customer?.metadata?.supabase_user_id === userId) matches.push(customer.id);
    }
    if (!list?.has_more || data.length === 0) break;
    startingAfter = data[data.length - 1]?.id;
    if (!startingAfter) break;
  }

  const unique = [...new Set(matches)];
  if (unique.length === 0) return null;
  if (unique.length > 1) {
    throw new AmbiguousCustomerError(
      `Multiple Stripe customers claim user ${userId} — refusing to bind automatically`,
    );
  }
  return unique[0];
}

export interface ResolveCustomerOptions {
  /** Create the customer when none can be found. Portal must pass false. */
  createIfMissing: boolean;
}

/**
 * Resolve (and persist) the Stripe customer for an authenticated user.
 * Returns null only when no customer exists and creation was not requested.
 */
export async function resolveCustomerForUser(
  stripe: any,
  supabase: any,
  user: { id: string; email: string },
  profile: UnknownRecord,
  options: ResolveCustomerOptions,
): Promise<string | null> {
  const stored = typeof profile?.stripe_customer_id === "string" ? profile.stripe_customer_id : null;

  if (stored) {
    if (await verifyCustomerOwnership(stripe, stored, user.id)) return stored;
    console.warn("[BILLING] Stored customer mapping is no longer valid, re-resolving");
  }

  const matched = await findCustomerByUserMetadata(stripe, user.email, user.id);
  if (matched) {
    await updateProfileOrThrow(supabase, user.id, { stripe_customer_id: matched });
    return matched;
  }

  if (!options.createIfMissing) return null;

  let created: any;
  try {
    created = await stripe.customers.create(
      { email: user.email, metadata: { supabase_user_id: user.id } },
      { idempotencyKey: `cust:${user.id}` },
    );
  } catch (err) {
    throw new RetryableBillingError(`Customer creation failed: ${(err as any)?.message ?? err}`);
  }
  await updateProfileOrThrow(supabase, user.id, { stripe_customer_id: created.id });
  return created.id;
}

// ---------------------------------------------------------------------------
// Authoritative membership selection
// ---------------------------------------------------------------------------

const STATUS_RANK: Record<string, number> = {
  active: 100,
  trialing: 95,
  past_due: 80,
  unpaid: 70,
  incomplete: 60,
  paused: 50,
  incomplete_expired: 20,
  canceled: 10,
};

const rank = (status: unknown) => STATUS_RANK[String(status)] ?? 0;

/** List every subscription for a customer, following pagination (not just 20). */
export async function listAllSubscriptions(stripe: any, customerId: string): Promise<any[]> {
  const all: any[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < 20; page++) {
    let list: any;
    try {
      list = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
        expand: ["data.items.data.price"],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
    } catch (err) {
      throw new RetryableBillingError(`Subscription list failed: ${(err as any)?.message ?? err}`);
    }
    const data: any[] = list?.data ?? [];
    all.push(...data);
    if (!list?.has_more || data.length === 0) break;
    startingAfter = data[data.length - 1]?.id;
    if (!startingAfter) break;
  }

  return all;
}

/**
 * Choose the CURRENT membership for a customer across every subscription page.
 *
 * An active/trialing membership always wins, regardless of which id the profile
 * currently stores, so a stale event about an old canceled subscription can
 * never overwrite a live one. When nothing is active the most recently created
 * membership by status rank is returned so the true state is still reported.
 */
export function pickCurrentMembership(
  subscriptions: any[],
  membershipProductId: string,
): any | null {
  const memberships = subscriptions.filter((s) => isMembershipSubscription(s, membershipProductId));
  if (memberships.length === 0) return null;

  const sorted = [...memberships].sort((a, b) => {
    const byStatus = rank(b.status) - rank(a.status);
    if (byStatus !== 0) return byStatus;
    return (b?.created ?? 0) - (a?.created ?? 0);
  });
  return sorted[0];
}

/** Fetch + choose in one step. */
export async function resolveCurrentMembership(
  stripe: any,
  customerId: string,
  membershipProductId: string,
): Promise<any | null> {
  const subs = await listAllSubscriptions(stripe, customerId);
  return pickCurrentMembership(subs, membershipProductId);
}

/** True when the customer has a membership that may still renew (blocks resale). */
export function hasRenewableMembership(subscription: any | null): boolean {
  if (!subscription) return false;
  const status = String(subscription.status ?? "");
  return isActiveStatus(status) || status === "past_due" || status === "unpaid" ||
    status === "incomplete";
}
