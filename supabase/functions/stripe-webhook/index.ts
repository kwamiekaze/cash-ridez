// ============================================================================
// STRIPE WEBHOOK ENDPOINT FOR CASHRIDEZ
// ============================================================================
//
// WEBHOOK URL: <project>/functions/v1/stripe-webhook
//
// SIGNING SECRETS (any configured one is accepted):
//   - STRIPE_WEBHOOK_SECRET           (legacy endpoint)
//   - STRIPE_WEBHOOK_SECRET_SNAPSHOT  (snapshot endpoint)
//   - STRIPE_WEBHOOK_SECRET_THIN      (thin endpoint)
//
// Semantics:
//   - Signature is verified BEFORE any processing. Invalid/missing -> 400.
//   - Processing failures -> 5xx so Stripe retries.
//   - Idempotent: an event id already recorded in billing_logs is skipped.
//   - Entitlement is scoped to the membership PRODUCT (legacy prices included)
//     and always re-read authoritatively from Stripe, so stale deliveries and
//     unrelated invoices/old canceled subs cannot revoke a live membership.
//   - No full payload logging.
// ============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  buildEntitlementUpdate,
  getInvoiceSubscriptionId,
  isActiveStatus,
  isGrantedPremium,
  isMembershipSubscription,
} from "../_shared/stripe-compat.ts";
import { MembershipConfigError, resolveMembershipProductId } from "../_shared/membership.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

const logBillingEvent = async (
  supabase: any,
  userId: string | null,
  eventType: string,
  eventId: string,
  data: any,
  error?: any,
) => {
  try {
    await supabase.from("billing_logs").insert({
      user_id: userId,
      event_type: eventType,
      stripe_event_id: eventId,
      request_body: data,
      error_code: error?.code || null,
      error_message: error?.message || null,
    });
  } catch (logError) {
    console.error("[WEBHOOK] Failed to log billing event:", (logError as any)?.message);
  }
};

/** True when this event id has already been processed successfully. */
const alreadyProcessed = async (supabase: any, eventId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from("billing_logs")
      .select("id")
      .eq("stripe_event_id", eventId)
      .is("error_message", null)
      .limit(1);
    if (error) {
      console.warn("[WEBHOOK] Idempotency lookup failed:", error.message);
      return false;
    }
    return !!(data && data.length);
  } catch {
    return false;
  }
};

const findProfileByCustomer = async (supabase: any, customerId: string) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, subscription_active, subscription_status, stripe_subscription_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error(`Profile lookup failed: ${error.message}`);
  return data;
};

const applyEntitlement = async (supabase: any, profile: any, subscription: any) => {
  if (isGrantedPremium(profile)) {
    console.log("[WEBHOOK] Granted premium preserved for", profile.id);
    return;
  }
  const update = buildEntitlementUpdate(subscription);
  const { error } = await supabase.from("profiles").update(update).eq("id", profile.id);
  if (error) throw new Error(`Entitlement update failed: ${error.message}`);
  console.log(`[WEBHOOK] Entitlement synced for ${profile.id}: ${update.subscription_status}`);
};

/**
 * Read the CURRENT state of a subscription from Stripe (never trust the event
 * snapshot, which may be stale) and confirm it belongs to the membership.
 */
const authoritativeMembership = async (
  subscriptionId: string,
  membershipProductId: string,
): Promise<any | null> => {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });
  return isMembershipSubscription(subscription, membershipProductId) ? subscription : null;
};

serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");

  const secrets = [
    ["LEGACY", Deno.env.get("STRIPE_WEBHOOK_SECRET")],
    ["SNAPSHOT", Deno.env.get("STRIPE_WEBHOOK_SECRET_SNAPSHOT")],
    ["THIN", Deno.env.get("STRIPE_WEBHOOK_SECRET_THIN")],
  ].filter(([, value]) => !!value) as [string, string][];

  if (!signature) {
    console.error("[WEBHOOK] Missing Stripe-Signature header");
    return new Response(JSON.stringify({ error: "Missing signature" }), { status: 400 });
  }

  if (secrets.length === 0) {
    console.error("[WEBHOOK] No webhook signing secrets configured");
    // Configuration problem on our side -> let Stripe retry.
    return new Response(JSON.stringify({ error: "No webhook secrets configured" }), { status: 500 });
  }

  const body = await req.text();
  let event: Stripe.Event | null = null;
  let verifiedWith: string | null = null;

  for (const [name, secret] of secrets) {
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, secret, undefined, cryptoProvider);
      verifiedWith = name;
      break;
    } catch {
      // try the next configured secret
    }
  }

  if (!event) {
    console.error("[WEBHOOK] Signature verification failed against all configured secrets");
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
  }

  console.log(`[WEBHOOK] ${event.type} (${event.id}) verified with ${verifiedWith} secret`);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  if (await alreadyProcessed(supabase, event.id)) {
    console.log(`[WEBHOOK] Event ${event.id} already processed, skipping`);
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  try {
    let membershipProductId: string | null = null;
    const needsMembershipScope = event.type !== "customer.created";
    if (needsMembershipScope) {
      membershipProductId = await resolveMembershipProductId(stripe, supabase);
    }

    switch (event.type) {
      case "customer.created": {
        const customer = event.data.object as Stripe.Customer;
        const userId = customer.metadata?.supabase_user_id;
        if (userId) {
          const { error } = await supabase
            .from("profiles")
            .update({ stripe_customer_id: customer.id })
            .eq("id", userId);
          if (error) throw new Error(`Customer id update failed: ${error.message}`);
        }
        await logBillingEvent(supabase, userId ?? null, event.type, event.id, { customerId: customer.id });
        break;
      }

      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (!subscriptionId) {
          console.log("[WEBHOOK] Checkout session without subscription, ignoring");
          await logBillingEvent(supabase, null, event.type, event.id, { sessionId: session.id });
          break;
        }

        const subscription = await authoritativeMembership(subscriptionId, membershipProductId!);
        if (!subscription) {
          console.log("[WEBHOOK] Checkout for a non-membership product, ignoring");
          await logBillingEvent(supabase, null, event.type, event.id, { sessionId: session.id, skipped: "non_membership" });
          break;
        }

        let profile: any = null;
        const userId = session.metadata?.supabase_user_id;
        if (userId) {
          const { data, error } = await supabase
            .from("profiles")
            .select("id, subscription_active, subscription_status, stripe_subscription_id")
            .eq("id", userId)
            .maybeSingle();
          if (error) throw new Error(`Profile lookup failed: ${error.message}`);
          profile = data;
        }
        if (!profile && session.customer) {
          profile = await findProfileByCustomer(supabase, session.customer as string);
        }
        if (!profile) {
          console.error("[WEBHOOK] No profile for completed checkout");
          await logBillingEvent(supabase, null, event.type, event.id, { sessionId: session.id }, {
            message: "No matching profile",
          });
          break;
        }

        if (session.customer) {
          await supabase
            .from("profiles")
            .update({ stripe_customer_id: session.customer as string })
            .eq("id", profile.id);
        }
        await applyEntitlement(supabase, profile, subscription);
        await logBillingEvent(supabase, profile.id, event.type, event.id, {
          subscriptionId: subscription.id,
          status: subscription.status,
        });
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const raw = event.data.object as Stripe.Subscription;
        const profile = await findProfileByCustomer(supabase, raw.customer as string);
        if (!profile) {
          console.log("[WEBHOOK] No profile for customer, ignoring");
          await logBillingEvent(supabase, null, event.type, event.id, { subscriptionId: raw.id });
          break;
        }

        // Re-read current state; a stale delivery must not overwrite newer state.
        let subscription: any = null;
        try {
          subscription = await authoritativeMembership(raw.id, membershipProductId!);
        } catch (err) {
          if ((err as any)?.code === "resource_missing") {
            subscription = null;
          } else {
            throw err;
          }
        }

        if (subscription === null) {
          const isKnownMembership = profile.stripe_subscription_id === raw.id;
          if (!isKnownMembership) {
            console.log("[WEBHOOK] Non-membership / unknown subscription, ignoring");
            await logBillingEvent(supabase, profile.id, event.type, event.id, {
              subscriptionId: raw.id,
              skipped: "non_membership",
            });
            break;
          }
          if (!isGrantedPremium(profile)) {
            const { error } = await supabase
              .from("profiles")
              .update({
                subscription_active: false,
                subscription_status: "canceled",
                is_member: false,
              })
              .eq("id", profile.id);
            if (error) throw new Error(`Cancel update failed: ${error.message}`);
          }
          await logBillingEvent(supabase, profile.id, event.type, event.id, { subscriptionId: raw.id, status: "canceled" });
          break;
        }

        // An old canceled membership must not deactivate a different live one.
        if (
          !isActiveStatus(subscription.status) &&
          profile.stripe_subscription_id &&
          profile.stripe_subscription_id !== subscription.id &&
          profile.subscription_active
        ) {
          console.log("[WEBHOOK] Ignoring inactive event for a superseded subscription");
          await logBillingEvent(supabase, profile.id, event.type, event.id, {
            subscriptionId: subscription.id,
            skipped: "superseded",
          });
          break;
        }

        await applyEntitlement(supabase, profile, subscription);
        await logBillingEvent(supabase, profile.id, event.type, event.id, {
          subscriptionId: subscription.id,
          status: subscription.status,
        });
        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getInvoiceSubscriptionId(invoice);
        if (!subscriptionId) {
          console.log("[WEBHOOK] Non-subscription invoice, ignoring");
          await logBillingEvent(supabase, null, event.type, event.id, { invoiceId: invoice.id });
          break;
        }

        const subscription = await authoritativeMembership(subscriptionId, membershipProductId!);
        if (!subscription) {
          console.log("[WEBHOOK] Invoice for an unrelated product, ignoring");
          await logBillingEvent(supabase, null, event.type, event.id, {
            invoiceId: invoice.id,
            skipped: "non_membership",
          });
          break;
        }

        const profile = await findProfileByCustomer(supabase, invoice.customer as string);
        if (!profile) {
          await logBillingEvent(supabase, null, event.type, event.id, { invoiceId: invoice.id });
          break;
        }

        await applyEntitlement(supabase, profile, subscription);

        if (event.type === "invoice.payment_failed" && !isGrantedPremium(profile)) {
          // One notification per failed invoice: the event-id idempotency guard
          // above already prevents duplicates on Stripe retries.
          const { error: notifyError } = await supabase.rpc("create_notification", {
            p_user_id: profile.id,
            p_type: "payment_failed",
            p_title: "Payment Failed",
            p_message:
              "Your unlimited access payment failed. Please update your payment method to restore access.",
            p_link: "/subscription",
          });
          if (notifyError) console.error("[WEBHOOK] Notification failed:", notifyError.message);
        }

        await logBillingEvent(supabase, profile.id, event.type, event.id, {
          invoiceId: invoice.id,
          status: subscription.status,
        });
        break;
      }

      default:
        console.log(`[WEBHOOK] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[WEBHOOK] Processing error for ${event.type} (${event.id}): ${message}`);
    await logBillingEvent(supabase, null, event.type, event.id, { eventType: event.type }, error);
    const status = error instanceof MembershipConfigError ? 503 : 500;
    return new Response(JSON.stringify({ error: "Processing failed" }), { status });
  }
});
