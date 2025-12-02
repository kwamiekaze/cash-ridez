// ============================================================================
// STRIPE WEBHOOK ENDPOINT FOR CASHRIDEZ
// ============================================================================
//
// This Supabase Edge Function handles Stripe webhook events for subscriptions.
//
// WEBHOOK URL (configure in Stripe Dashboard):
//   https://wnajjqsqmrpwyffbpgsj.supabase.co/functions/v1/stripe-webhook
//
// REQUIRED SECRETS (already configured in Lovable Cloud):
//   - STRIPE_SECRET_KEY: Your live Stripe secret key
//   - STRIPE_WEBHOOK_SECRET_SNAPSHOT: Primary webhook signing secret (Snapshot endpoint)
//   - STRIPE_WEBHOOK_SECRET_THIN: Secondary webhook signing secret (Thin endpoint)
//
// EVENTS HANDLED:
//   - checkout.session.completed: New subscription purchased
//   - customer.created: New customer created in Stripe
//   - invoice.payment_succeeded: Subscription renewed successfully
//   - invoice.payment_failed: Payment failed (deactivates subscription)
//   - customer.subscription.updated: Subscription status changed
//   - customer.subscription.deleted: Subscription cancelled
//
// IMPORTANT:
//   - This endpoint supports TWO webhook secrets for flexibility
//   - Always returns HTTP 200 to prevent Stripe retry storms
//   - Logs all events for debugging (check Supabase logs)
//   - Updates profiles table with subscription_active and subscription_status
//
// ============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

const logBillingEvent = async (supabase: any, userId: string | null, eventType: string, eventId: string, data: any, error?: any) => {
  try {
    await supabase.from('billing_logs').insert({
      user_id: userId,
      event_type: eventType,
      stripe_event_id: eventId,
      request_body: data,
      error_code: error?.code || null,
      error_message: error?.message || null,
    });
  } catch (logError) {
    console.error('Failed to log billing event:', logError);
  }
};

serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  
  // Get both webhook secrets
  const primarySecret = Deno.env.get("STRIPE_WEBHOOK_SECRET_SNAPSHOT");
  const thinSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET_THIN");

  console.log(`🔥 [WEBHOOK] Stripe webhook received`);
  console.log(`[WEBHOOK] Signature present: ${!!signature}`);
  console.log(`[WEBHOOK] Snapshot secret available: ${!!primarySecret}`);
  console.log(`[WEBHOOK] Thin secret available: ${!!thinSecret}`);

  // CRITICAL: Always return 200 to Stripe, even on errors, to prevent retry storms
  if (!signature) {
    console.error("[WEBHOOK] Missing Stripe-Signature header");
    return new Response(JSON.stringify({ received: false, error: "Missing signature" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!primarySecret && !thinSecret) {
    console.error("[WEBHOOK] No webhook secrets configured");
    return new Response(JSON.stringify({ received: false, error: "No webhook secrets configured" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.text();
  let event: Stripe.Event;
  let verifiedSecret: string | null = null;

  // Try primary secret first (Snapshot)
  if (primarySecret) {
    try {
      console.log("[WEBHOOK] Attempting verification with SNAPSHOT secret");
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        primarySecret,
        undefined,
        cryptoProvider
      );
      verifiedSecret = "SNAPSHOT";
      console.log("[WEBHOOK] ✓ Verification successful with SNAPSHOT secret");
    } catch (err) {
      console.log("[WEBHOOK] Snapshot secret verification failed, trying thin secret...");
    }
  }

  // Try thin secret if primary failed or wasn't available
  if (!event && thinSecret) {
    try {
      console.log("[WEBHOOK] Attempting verification with THIN secret");
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        thinSecret,
        undefined,
        cryptoProvider
      );
      verifiedSecret = "THIN";
      console.log("[WEBHOOK] ✓ Verification successful with THIN secret");
    } catch (err) {
      console.log("[WEBHOOK] Thin secret verification also failed");
    }
  }

  // If both secrets failed
  if (!event!) {
    console.error("[WEBHOOK] ✗ Signature verification failed with both secrets");
    // Return 200 even on signature failure to prevent Stripe retry storms
    return new Response(JSON.stringify({ received: false, error: "Signature verification failed" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`🔥 [WEBHOOK] Stripe event received: ${event.type} (verified with ${verifiedSecret} secret)`);
  console.log(`[WEBHOOK] Event ID: ${event.id}`);
  console.log(`[WEBHOOK] Full event payload:`, JSON.stringify(event, null, 2));

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    switch (event.type) {
      case "customer.created": {
        const customer = event.data.object as Stripe.Customer;
        console.log(`[WEBHOOK] Customer created - ID: ${customer.id}, Email: ${customer.email}`);
        
        // Store customer ID if we have user metadata
        const userId = customer.metadata?.supabase_user_id;
        if (userId) {
          const { error: updateError } = await supabase
            .from("profiles")
            .update({ stripe_customer_id: customer.id })
            .eq("id", userId);

          if (updateError) {
            console.error(`[WEBHOOK] Failed to update customer ID for user ${userId}:`, updateError);
          } else {
            console.log(`[WEBHOOK] ✓ Stored customer ID ${customer.id} for user ${userId}`);
          }
          await logBillingEvent(supabase, userId, event.type, event.id, { customerId: customer.id });
        } else {
          console.log(`[WEBHOOK] No user ID in customer metadata, skipping profile update`);
          await logBillingEvent(supabase, null, event.type, event.id, { customerId: customer.id });
        }
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[WEBHOOK] Checkout completed - Customer: ${session.customer}, Subscription: ${session.subscription}`);

        const userId = session.metadata?.supabase_user_id;
        if (!userId) {
          console.error("[WEBHOOK] ✗ No user ID in session metadata");
          await logBillingEvent(supabase, null, event.type, event.id, session, { message: 'No user ID in metadata' });
          break;
        }

        // Get subscription details
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          
          await supabase
            .from("profiles")
            .update({
              stripe_subscription_id: subscription.id,
              subscription_active: ['active', 'trialing'].includes(subscription.status),
              subscription_status: subscription.status,
              subscription_current_period_end: subscription.current_period_end,
              is_member: true,
            })
            .eq("id", userId);

          console.log(`[WEBHOOK] ✓ Subscription activated for user ${userId}, status: ${subscription.status}`);
          await logBillingEvent(supabase, userId, event.type, event.id, { subscriptionId: subscription.id, status: subscription.status });
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`[WEBHOOK] Payment succeeded - Customer: ${invoice.customer}, Invoice: ${invoice.id}`);

        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          
          // Find user by customer ID
          const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("stripe_customer_id", invoice.customer as string)
            .single();

          if (profile) {
            await supabase
              .from("profiles")
              .update({
                subscription_active: ['active', 'trialing'].includes(subscription.status),
                subscription_status: subscription.status,
                subscription_current_period_end: subscription.current_period_end,
                is_member: true,
              })
              .eq("id", profile.id);

            console.log(`[WEBHOOK] ✓ Subscription renewed for user ${profile.id}, status: ${subscription.status}`);
            await logBillingEvent(supabase, profile.id, event.type, event.id, { invoiceId: invoice.id, status: subscription.status });
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`[WEBHOOK] ✗ Payment failed - Customer: ${invoice.customer}, Invoice: ${invoice.id}`);

        // Find user by customer ID
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", invoice.customer as string)
          .single();

        if (profile) {
          await supabase
            .from("profiles")
            .update({
              subscription_active: false,
              subscription_status: 'past_due',
              is_member: false,
            })
            .eq("id", profile.id);

          console.log(`[WEBHOOK] ✗ Subscription deactivated for user ${profile.id} due to payment failure`);
          await logBillingEvent(supabase, profile.id, event.type, event.id, { invoiceId: invoice.id });
          
          // Create notification
          await supabase.rpc('create_notification', {
            p_user_id: profile.id,
            p_type: 'payment_failed',
            p_title: 'Payment Failed',
            p_message: 'Your unlimited access payment failed. Please update your payment method to restore access.',
            p_link: '/subscription',
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`[WEBHOOK] Subscription updated - ID: ${subscription.id}, Status: ${subscription.status}`);

        // Find user by customer ID
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", subscription.customer as string)
          .single();

        if (profile) {
          const isActive = ['active', 'trialing'].includes(subscription.status);
          
          await supabase
            .from("profiles")
            .update({
              subscription_active: isActive,
              subscription_status: subscription.status, // FIX: Also update subscription_status
              subscription_current_period_end: subscription.current_period_end,
              is_member: isActive,
            })
            .eq("id", profile.id);

          console.log(`[WEBHOOK] ✓ Subscription status updated for user ${profile.id}: ${isActive ? 'active' : 'inactive'}, status: ${subscription.status}`);
          await logBillingEvent(supabase, profile.id, event.type, event.id, { subscriptionId: subscription.id, status: subscription.status });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`[WEBHOOK] Subscription deleted - ID: ${subscription.id}`);

        // Find user by customer ID
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", subscription.customer as string)
          .single();

        if (profile) {
          await supabase
            .from("profiles")
            .update({
              subscription_active: false,
              subscription_status: 'canceled', // FIX: Also update subscription_status
              is_member: false,
            })
            .eq("id", profile.id);

          console.log(`[WEBHOOK] ✓ Subscription cancelled for user ${profile.id}`);
          await logBillingEvent(supabase, profile.id, event.type, event.id, { subscriptionId: subscription.id });
        }
        break;
      }

      default:
        console.log(`[WEBHOOK] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[WEBHOOK] Error processing event: ${errorMessage}`);
    await logBillingEvent(supabase, null, event.type, event.id, event.data.object, error);
    
    // CRITICAL: Return 200 even on processing errors to prevent Stripe retry storms
    return new Response(JSON.stringify({ received: true, error: errorMessage }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
