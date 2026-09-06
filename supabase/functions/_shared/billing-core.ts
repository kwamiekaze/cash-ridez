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
 *  - Every Stripe LIST response is shape-validated. A malformed body (`{}`,
 *    missing `has_more`, missing ids) is an ERROR, never "this customer has no
 *    subscriptions". Pagination-cap exhaustion is an ERROR, never truncation.
 *  - Any profile read/write error ABORTS. It never falls through to creating or
 *    recovering a customer, and never degrades into "free / 0 connections".
 *  - Transport/config errors never revoke entitlement.
 *  - Missing atomic RPCs are a RETRYABLE dependency failure. There is no
 *    non-atomic fallback path.
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

/** A required atomic database dependency (pending SQL) is not installed. */
export class MissingDependencyError extends RetryableBillingError {
  constructor(what: string) {
    super(
      `Required database function ${what} is not installed. ` +
        `Apply docs/pending-migrations/billing.sql before serving billing traffic.`,
    );
    this.name = "MissingDependencyError";
  }
}

/** The customer could not be bound to this user unambiguously and safely. */
export class AmbiguousCustomerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmbiguousCustomerError";
  }
}

/** True when a Postgres/PostgREST error says the function does not exist. */
export const isMissingRpc = (error: any): boolean =>
  error?.code === "42883" || error?.code === "PGRST202" ||
  /could not find the function|does not exist/i.test(String(error?.message ?? ""));

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
// Stripe list-response validation
// ---------------------------------------------------------------------------

/** Maximum pages we will follow. Exhausting it is an error, not truncation. */
export const PAGE_CAP = 20;

/**
 * Validate the envelope of a Stripe list response.
 * `{}`, `null`, a missing `data` array or a missing `has_more` boolean are all
 * malformed — returning "empty" here would silently revoke a real member.
 */
export function assertStripeList(list: any, what: string): any[] {
  if (!list || typeof list !== "object" || Array.isArray(list)) {
    throw new RetryableBillingError(`${what}: malformed Stripe list response`);
  }
  if (!Array.isArray(list.data)) {
    throw new RetryableBillingError(`${what}: Stripe list response has no data array`);
  }
  if (typeof list.has_more !== "boolean") {
    throw new RetryableBillingError(`${what}: Stripe list response has no has_more flag`);
  }
  return list.data as any[];
}

/** Read a Stripe id reference that may be a string or an expanded object. */
export function idRef(value: unknown): string | null {
  if (typeof value === "string" && value !== "") return value;
  if (value && typeof value === "object" && typeof (value as any).id === "string") {
    return (value as any).id;
  }
  return null;
}

/**
 * Follow a Stripe cursor to exhaustion, validating every page.
 * Throws when the cap is reached while Stripe still reports `has_more`, so a
 * truncated list can never be mistaken for the whole picture.
 */
export async function paginateStripe(
  what: string,
  fetchPage: (startingAfter?: string) => Promise<any>,
  validateItem: (item: any, index: number) => void,
): Promise<any[]> {
  const all: any[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < PAGE_CAP; page++) {
    let list: any;
    try {
      list = await fetchPage(startingAfter);
    } catch (err) {
      throw new RetryableBillingError(`${what} failed: ${(err as any)?.message ?? err}`);
    }
    const data = assertStripeList(list, what);
    data.forEach(validateItem);
    all.push(...data);

    if (!list.has_more) return all;
    if (data.length === 0) {
      // has_more with an empty page means we cannot advance the cursor.
      throw new RetryableBillingError(`${what}: Stripe reported more pages but returned none`);
    }
    const cursor = idRef(data[data.length - 1]?.id);
    if (!cursor) throw new RetryableBillingError(`${what}: cannot build pagination cursor`);
    startingAfter = cursor;
  }

  throw new RetryableBillingError(
    `${what}: exceeded ${PAGE_CAP} pages — refusing to act on a truncated list`,
  );
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

/**
 * Conditionally bind a Stripe customer to a profile.
 *
 * The UPDATE is guarded on the expected previous value, and the affected rows
 * are verified: zero rows means somebody else bound a different customer
 * concurrently, which is a conflict — never a silent success.
 */
export async function bindCustomerMapping(
  supabase: any,
  userId: string,
  customerId: string,
  expectedPrevious: string | null,
): Promise<void> {
  let query = supabase
    .from("profiles")
    .update({ stripe_customer_id: customerId })
    .eq("id", userId);
  query = expectedPrevious === null
    ? query.is("stripe_customer_id", null)
    : query.eq("stripe_customer_id", expectedPrevious);

  const { data, error } = await query.select("id, stripe_customer_id");
  if (error) throw new RetryableBillingError(`Customer link failed: ${error.message}`);

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length === 1) return;

  // Nothing changed. Either the row already holds this exact customer (benign
  // re-run) or it holds a different one (conflict — refuse).
  const { data: current, error: readError } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();
  if (readError) throw new RetryableBillingError(`Customer link verify failed: ${readError.message}`);
  if (current?.stripe_customer_id === customerId) return;

  throw new AmbiguousCustomerError(
    `Refusing to rebind user ${userId}: profile already points at a different Stripe customer`,
  );
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
  if (!customer || typeof customer !== "object") {
    throw new RetryableBillingError("Customer lookup returned a malformed response");
  }
  if (customer.deleted) return false;
  if (typeof customer.id !== "string" || customer.id === "") {
    throw new RetryableBillingError("Customer lookup returned a customer without an id");
  }
  const owner = customer?.metadata?.supabase_user_id;
  if (typeof owner === "string" && owner !== "") return owner === userId;
  // Legacy customers created before metadata existed: trust ONLY because the id
  // came from our own profile row (already a trusted mapping).
  return true;
}

function validateCustomerItem(customer: any, index: number) {
  if (!customer || typeof customer !== "object") {
    throw new RetryableBillingError(`Customer search: item ${index} is not an object`);
  }
  if (typeof customer.id !== "string" || !customer.id.startsWith("cus_")) {
    throw new RetryableBillingError(`Customer search: item ${index} has no customer id`);
  }
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
  const customers = await paginateStripe(
    "Customer search",
    (startingAfter) =>
      stripe.customers.list({
        email,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }),
    validateCustomerItem,
  );

  const matches = customers
    .filter((c) => !c.deleted && c?.metadata?.supabase_user_id === userId)
    .map((c) => c.id as string);

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
  const stored = typeof profile?.stripe_customer_id === "string" && profile.stripe_customer_id
    ? (profile.stripe_customer_id as string)
    : null;

  if (stored) {
    if (await verifyCustomerOwnership(stripe, stored, user.id)) return stored;
    console.warn("[BILLING] Stored customer mapping is no longer valid, re-resolving");
  }

  const matched = await findCustomerByUserMetadata(stripe, user.email, user.id);
  if (matched) {
    await bindCustomerMapping(supabase, user.id, matched, stored);
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
  if (typeof created?.id !== "string" || !created.id.startsWith("cus_")) {
    throw new RetryableBillingError("Customer creation returned a malformed response");
  }
  await bindCustomerMapping(supabase, user.id, created.id, stored);
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

function validateSubscriptionItem(customerId: string) {
  return (sub: any, index: number) => {
    if (!sub || typeof sub !== "object") {
      throw new RetryableBillingError(`Subscription list: item ${index} is not an object`);
    }
    if (typeof sub.id !== "string" || !sub.id.startsWith("sub_")) {
      throw new RetryableBillingError(`Subscription list: item ${index} has no subscription id`);
    }
    if (typeof sub.status !== "string" || sub.status.trim() === "") {
      throw new RetryableBillingError(`Subscription list: ${sub.id} has no status`);
    }
    const owner = idRef(sub.customer);
    if (!owner) {
      throw new RetryableBillingError(`Subscription list: ${sub.id} has no customer`);
    }
    if (owner !== customerId) {
      throw new RetryableBillingError(
        `Subscription list: ${sub.id} belongs to a different customer`,
      );
    }
    if (!Array.isArray(sub?.items?.data)) {
      throw new RetryableBillingError(`Subscription list: ${sub.id} has no items`);
    }
  };
}

/** List every subscription for a customer, following pagination to exhaustion. */
export async function listAllSubscriptions(stripe: any, customerId: string): Promise<any[]> {
  return await paginateStripe(
    "Subscription list",
    (startingAfter) =>
      stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
        expand: ["data.items.data.price"],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }),
    validateSubscriptionItem(customerId),
  );
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
    status === "incomplete" || status === "paused";
}

// ---------------------------------------------------------------------------
// Monotonic sync generation (shared by status + webhook)
// ---------------------------------------------------------------------------

/**
 * Reserve a database-monotonic generation number BEFORE reading Stripe.
 *
 * Ordering by the Stripe event timestamp alone is unsafe: two events created in
 * the same second compare equal, and the status endpoint carries no event at
 * all. Reserving first and applying only if we are still the newest reader
 * means an older invocation can never overwrite later-observed state.
 */
export async function reserveSyncGeneration(supabase: any, userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("reserve_billing_sync_generation", {
    p_user_id: userId,
  });
  if (error) {
    if (isMissingRpc(error)) throw new MissingDependencyError("reserve_billing_sync_generation");
    throw new RetryableBillingError(`Sync generation reservation failed: ${error.message}`);
  }
  const generation = typeof data === "number" ? data : Number(data);
  if (!Number.isFinite(generation) || generation <= 0) {
    throw new RetryableBillingError("Sync generation reservation returned a malformed value");
  }
  return generation;
}

export interface ApplyResult {
  applied: boolean;
  stale: boolean;
  granted: boolean;
}

/** Validate the jsonb returned by the entitlement RPCs — null is NOT success. */
export function parseApplyResult(data: any, what: string): ApplyResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new RetryableBillingError(`${what} returned a malformed result`);
  }
  if (typeof data.applied !== "boolean" || typeof data.stale !== "boolean") {
    throw new RetryableBillingError(`${what} returned an incomplete result`);
  }
  return { applied: data.applied, stale: data.stale, granted: data.granted === true };
}

/**
 * Apply an entitlement outside the webhook path (status endpoint).
 * The RPC locks the profile, re-checks the admin grant, verifies the expected
 * customer mapping and refuses to apply an older generation.
 */
export async function applySyncEntitlement(
  supabase: any,
  args: {
    userId: string;
    generation: number;
    entitlement: UnknownRecord | null;
    expectedCustomerId: string | null;
  },
): Promise<ApplyResult> {
  const { data, error } = await supabase.rpc("apply_billing_sync", {
    p_user_id: args.userId,
    p_generation: args.generation,
    p_entitlement: args.entitlement,
    p_expected_customer_id: args.expectedCustomerId,
  });
  if (error) {
    if (isMissingRpc(error)) throw new MissingDependencyError("apply_billing_sync");
    throw new RetryableBillingError(`Entitlement sync failed: ${error.message}`);
  }
  return parseApplyResult(data, "apply_billing_sync");
}
