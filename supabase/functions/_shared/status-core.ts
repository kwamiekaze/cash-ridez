/**
 * Subscription status resolution, dependency-injected for unit testing.
 *
 * Never revokes on a transport/config error: the last confirmed DB state is
 * returned with `stale: true` and a `retryable_error` code so the client can
 * tell "confirmed" apart from "unknown".
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
  loadProfileOrThrow,
  resolveCurrentMembership,
  RetryableBillingError,
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

const fromProfile = (profile: UnknownRecord, extra: UnknownRecord = {}): StatusResult => {
  const connected = Number(profile?.connected_trips_count ?? 0) || 0;
  const active = profile?.subscription_active === true &&
    (profile?.subscription_status === "active" || profile?.subscription_status === "trialing" ||
      profile?.subscription_status === "premium");
  return {
    status: 200,
    body: {
      subscribed: active,
      subscription_status: profile?.subscription_status ?? null,
      subscription_end: periodEndToIso(profile?.subscription_current_period_end as number ?? null),
      cancel_at_period_end: false,
      has_billing_account: !!profile?.stripe_customer_id,
      completed_trips: Number(profile?.completed_trips_count ?? 0) || 0,
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

  let membership: any = null;
  try {
    membership = await resolveCurrentMembership(deps.stripe, customerId, membershipProductId);
  } catch (err) {
    console.error("[CHECK-SUB] Stripe unavailable:", (err as any)?.message);
    return fromProfile(profile, { stale: true, retryable_error: "stripe_unavailable" });
  }

  if (!membership) {
    // Authoritative: this customer has no membership subscription at all.
    if (profile.subscription_active || profile.stripe_subscription_id) {
      const { error } = await deps.supabase
        .from("profiles")
        .update({
          subscription_active: false,
          subscription_status: "canceled",
          is_member: false,
          stripe_subscription_id: null,
        })
        .eq("id", userId);
      if (error) {
        console.error("[CHECK-SUB] Failed to persist revocation:", error.message);
        return fromProfile(profile, { stale: true, retryable_error: "db_write_failed" });
      }
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

  const { error: updateError } = await deps.supabase.from("profiles").update(update).eq("id", userId);
  if (updateError) {
    // The DB sync failed: do NOT claim a confirmed success.
    console.error("[CHECK-SUB] Failed to sync entitlement:", updateError.message);
    return fromProfile(profile, { stale: true, retryable_error: "db_write_failed" });
  }

  const connected = Number(profile.connected_trips_count ?? 0) || 0;
  return {
    status: 200,
    body: {
      subscribed: update.subscription_active,
      subscription_status: update.subscription_status,
      subscription_end: periodEndToIso(getSubscriptionPeriodEnd(membership, membershipProductId)),
      cancel_at_period_end: isCancelScheduled(membership),
      has_billing_account: true,
      completed_trips: Number(profile.completed_trips_count ?? 0) || 0,
      connected_trips: connected,
      trips_remaining: update.subscription_active ? "unlimited" : Math.max(0, FREE_CONNECTIONS - connected),
    },
  };
}

export { RetryableBillingError };
