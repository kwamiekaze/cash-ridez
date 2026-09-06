/**
 * Subscription status resolution, dependency-injected for unit testing.
 *
 * Never revokes on a transport/config error: the last confirmed DB state is
 * returned with `stale: true` and a `retryable_error` code so the client can
 * tell "confirmed" apart from "unknown".
 *
 * Ordering: a DB-monotonic generation is reserved BEFORE the authoritative
 * Stripe read, and the write is only applied if we are still the newest reader
 * for that profile. This endpoint therefore cannot race the webhook into
 * revoking a subscription the webhook has just confirmed, and cannot overwrite
 * an admin grant (the RPC re-checks it under a row lock).
 */

import {
  buildEntitlementUpdate,
  isCancelScheduled,
  isGrantedPremium,
  getSubscriptionPeriodEnd,
  periodEndToIso,
  type UnknownRecord,
} from "./stripe-compat.ts";
import {
  applySyncEntitlement,
  loadProfileOrThrow,
  resolveCurrentMembership,
  reserveSyncGeneration,
  RetryableBillingError,
  verifyCustomerOwnership,
} from "./billing-core.ts";

export const FREE_CONNECTIONS = 3;

export interface StatusDeps {
  stripe: any;
  supabase: any;
  resolveMembershipProductId: () => Promise<string>;
}

export interface StatusResult {
  status: number;
  body: UnknownRecord;
}

const counter = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

/**
 * The connection counter can never be guessed: a missing / malformed value is
 * NOT zero ("no connections used"). Fail so the caller reports unknown.
 */
const strictCounter = (value: unknown): number => {
  if (value === null || value === undefined || value === "") {
    throw new RetryableBillingError("connection counter unavailable");
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new RetryableBillingError("connection counter unavailable");
  }
  return Math.floor(n);
};

const fromProfile = (profile: UnknownRecord, extra: UnknownRecord = {}): StatusResult => {
  const connected = strictCounter(profile?.connected_trips_count);
  const active = profile?.subscription_active === true &&
    (profile?.subscription_status === "active" || profile?.subscription_status === "trialing" ||
      profile?.subscription_status === "premium");
  return {
    status: 200,
    body: {
      subscribed: active,
      granted: isGrantedPremium(profile),
      subscription_status: profile?.subscription_status ?? null,
      subscription_end: periodEndToIso(profile?.subscription_current_period_end as number ?? null),
      cancel_at_period_end: false,
      has_billing_account: !!profile?.stripe_customer_id,
      completed_trips: counter(profile?.completed_trips_count),
      connected_trips: connected,
      trips_remaining: active ? "unlimited" : Math.max(0, FREE_CONNECTIONS - connected),
      ...extra,
    },
  };
};

export async function getSubscriptionStatus(deps: StatusDeps, userId: string): Promise<StatusResult> {
  // A missing profile or a query error ABORTS — it must never look like a
  // brand-new free user with 0 connections.
  const profile = await loadProfileOrThrow(deps.supabase, userId);

  if (isGrantedPremium(profile)) {
    return fromProfile(profile, { subscribed: true, granted: true, trips_remaining: "unlimited" });
  }

  const customerId = profile.stripe_customer_id;
  if (typeof customerId !== "string" || !customerId) {
    return fromProfile(profile, { subscribed: false });
  }

  let membershipProductId: string;
  try {
    membershipProductId = await deps.resolveMembershipProductId();
  } catch (err) {
    console.error("[CHECK-SUB] Membership config unavailable:", (err as any)?.message);
    return fromProfile(profile, { stale: true, retryable_error: "membership_config_unavailable" });
  }

  // The stored mapping must still be ours before we read or write anything
  // against it — the same rule checkout and the portal already apply.
  try {
    const owned = await verifyCustomerOwnership(deps.stripe, customerId, userId);
    if (!owned) {
      return fromProfile(profile, { stale: true, retryable_error: "customer_mapping_invalid" });
    }
  } catch (err) {
    console.error("[CHECK-SUB] Customer verification failed:", (err as any)?.message);
    return fromProfile(profile, { stale: true, retryable_error: "stripe_unavailable" });
  }

  // Reserve ordering BEFORE the authoritative read.
  let generation: number;
  try {
    generation = await reserveSyncGeneration(deps.supabase, userId);
  } catch (err) {
    console.error("[CHECK-SUB] Sync generation unavailable:", (err as any)?.message);
    return fromProfile(profile, { stale: true, retryable_error: "sync_unavailable" });
  }

  let membership: any = null;
  try {
    membership = await resolveCurrentMembership(deps.stripe, customerId, membershipProductId);
  } catch (err) {
    console.error("[CHECK-SUB] Stripe unavailable:", (err as any)?.message);
    return fromProfile(profile, { stale: true, retryable_error: "stripe_unavailable" });
  }

  if (!membership) {
    // Authoritative: this customer has no membership subscription at all.
    if (!profile.subscription_active && !profile.stripe_subscription_id) {
      return fromProfile(profile, { subscribed: false });
    }
    let result;
    try {
      result = await applySyncEntitlement(deps.supabase, {
        userId,
        generation,
        expectedCustomerId: customerId,
        entitlement: {
          subscription_active: false,
          subscription_status: "canceled",
          is_member: false,
          stripe_subscription_id: null,
        },
      });
    } catch (err) {
      console.error("[CHECK-SUB] Failed to persist revocation:", (err as any)?.message);
      return fromProfile(profile, { stale: true, retryable_error: "db_write_failed" });
    }
    if (result.granted) {
      return fromProfile(profile, { subscribed: true, granted: true, trips_remaining: "unlimited" });
    }
    if (!result.applied) {
      // A newer reader (usually the webhook) already wrote a later observation.
      return fromProfile(profile, { stale: true, retryable_error: "superseded" });
    }
    return fromProfile(
      { ...profile, subscription_active: false, subscription_status: "canceled" },
      { subscribed: false },
    );
  }

  let update: ReturnType<typeof buildEntitlementUpdate>;
  try {
    update = buildEntitlementUpdate(membership, membershipProductId);
  } catch (err) {
    // A successful but malformed response is an error, never a revocation.
    console.error("[CHECK-SUB] Malformed subscription payload:", (err as any)?.message);
    return fromProfile(profile, { stale: true, retryable_error: "malformed_subscription" });
  }

  let result;
  try {
    result = await applySyncEntitlement(deps.supabase, {
      userId,
      generation,
      expectedCustomerId: customerId,
      entitlement: update,
    });
  } catch (err) {
    // The DB sync failed: do NOT claim a confirmed success.
    console.error("[CHECK-SUB] Failed to sync entitlement:", (err as any)?.message);
    return fromProfile(profile, { stale: true, retryable_error: "db_write_failed" });
  }

  if (result.granted) {
    return fromProfile(profile, { subscribed: true, granted: true, trips_remaining: "unlimited" });
  }
  if (!result.applied) {
    // Superseded by a newer observation: report the previous confirmed state as
    // stale rather than claiming this read is authoritative.
    return fromProfile(profile, { stale: true, retryable_error: "superseded" });
  }

  const connected = strictCounter(profile.connected_trips_count);
  return {
    status: 200,
    body: {
      subscribed: update.subscription_active,
      granted: false,
      subscription_status: update.subscription_status,
      subscription_end: periodEndToIso(getSubscriptionPeriodEnd(membership, membershipProductId)),
      cancel_at_period_end: isCancelScheduled(membership),
      has_billing_account: true,
      completed_trips: counter(profile.completed_trips_count),
      connected_trips: connected,
      trips_remaining: update.subscription_active ? "unlimited" : Math.max(0, FREE_CONNECTIONS - connected),
    },
  };
}

export { RetryableBillingError };
