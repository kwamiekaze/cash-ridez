import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  buildEntitlementUpdate,
  getSubscriptionPeriodEnd,
  isActiveStatus,
  isCancelScheduled,
  isGrantedPremium,
  isMembershipSubscription,
  periodEndToIso,
  shouldRevokeOnError,
} from "../_shared/stripe-compat.ts";
import { MembershipConfigError, resolveMembershipProductId } from "../_shared/membership.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FREE_CONNECTIONS = 3;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  let profile: any = null;

  /** Last confirmed DB state. Used whenever Stripe cannot be trusted. */
  const fromDb = (extra: Record<string, unknown> = {}) => {
    const connected = profile?.connected_trips_count || 0;
    const active = !!profile?.subscription_active;
    return json({
      subscribed: active,
      subscription_status: profile?.subscription_status ?? null,
      subscription_end: periodEndToIso(profile?.subscription_current_period_end ?? null),
      cancel_at_period_end: !!profile?.subscription_cancel_at_period_end,
      has_billing_account: !!profile?.stripe_customer_id,
      completed_trips: profile?.completed_trips_count || 0,
      connected_trips: connected,
      trips_remaining: active ? "unlimited" : Math.max(0, FREE_CONNECTIONS - connected),
      ...extra,
    });
  };

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");

    const { data: profileRow } = await supabaseClient
      .from("profiles")
      .select(
        "stripe_customer_id, stripe_subscription_id, subscription_active, subscription_status, subscription_current_period_end, completed_trips_count, connected_trips_count",
      )
      .eq("id", user.id)
      .single();
    profile = profileRow;

    // Admin/granted premium has no Stripe subscription behind it — never touch it.
    if (isGrantedPremium(profile)) {
      console.log("[CHECK-SUB] Granted premium preserved for", user.id);
      return fromDb({ subscribed: true, granted: true, trips_remaining: "unlimited" });
    }

    if (!profile?.stripe_customer_id) {
      return fromDb({ subscribed: false });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let membershipProductId: string;
    try {
      membershipProductId = await resolveMembershipProductId(stripe, supabaseClient);
    } catch (err) {
      // Retryable config problem: keep last confirmed state, never revoke.
      console.error("[CHECK-SUB] Membership config unavailable:", (err as any)?.message);
      return fromDb({ stale: true, retryable_error: "membership_config_unavailable" });
    }

    let subscription: any = null;

    if (profile.stripe_subscription_id) {
      try {
        subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
      } catch (err) {
        if (!shouldRevokeOnError(err as any)) {
          console.error("[CHECK-SUB] Transient Stripe error, preserving state:", (err as any)?.message);
          return fromDb({ stale: true, retryable_error: "stripe_unavailable" });
        }
        console.warn("[CHECK-SUB] Stored subscription id missing in Stripe, will re-discover");
        subscription = null;
      }
    }

    // Recover a missing/foreign subscription id from the customer's membership subs.
    if (!subscription || !isMembershipSubscription(subscription, membershipProductId)) {
      try {
        const list = await stripe.subscriptions.list({
          customer: profile.stripe_customer_id,
          status: "all",
          limit: 20,
          expand: ["data.items.data.price"],
        });
        const memberships = list.data.filter((s: any) => isMembershipSubscription(s, membershipProductId));
        subscription =
          memberships.find((s: any) => isActiveStatus(s.status)) ??
          memberships[0] ??
          null;
      } catch (err) {
        console.error("[CHECK-SUB] Could not list subscriptions:", (err as any)?.message);
        return fromDb({ stale: true, retryable_error: "stripe_unavailable" });
      }
    }

    if (!subscription) {
      // Authoritative: this customer has no membership subscription at all.
      if (profile.subscription_active || profile.stripe_subscription_id) {
        const { error: updErr } = await supabaseClient
          .from("profiles")
          .update({
            subscription_active: false,
            subscription_status: "canceled",
            is_member: false,
            stripe_subscription_id: null,
          })
          .eq("id", profile.id ?? user.id);
        if (updErr) console.error("[CHECK-SUB] Failed to persist revocation:", updErr.message);
      }
      profile = { ...profile, subscription_active: false, subscription_status: "canceled" };
      return fromDb({ subscribed: false });
    }

    const update = buildEntitlementUpdate(subscription);
    const { error: updateError } = await supabaseClient
      .from("profiles")
      .update(update)
      .eq("id", user.id);
    if (updateError) console.error("[CHECK-SUB] Failed to sync entitlement:", updateError.message);

    const connected = profile.connected_trips_count || 0;
    return json({
      subscribed: update.subscription_active,
      subscription_status: update.subscription_status,
      subscription_end: periodEndToIso(getSubscriptionPeriodEnd(subscription)),
      cancel_at_period_end: isCancelScheduled(subscription),
      has_billing_account: true,
      completed_trips: profile.completed_trips_count || 0,
      connected_trips: connected,
      trips_remaining: update.subscription_active ? "unlimited" : Math.max(0, FREE_CONNECTIONS - connected),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[CHECK-SUB] ERROR:", message);
    if (error instanceof MembershipConfigError && profile) {
      return fromDb({ stale: true, retryable_error: "membership_config_unavailable" });
    }
    return json({ error: message }, 500);
  }
});
