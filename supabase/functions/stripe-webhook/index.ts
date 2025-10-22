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
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!signature || !webhookSecret) {
    console.error("Missing signature or webhook secret");
    return new Response("Webhook Error: Missing signature or secret", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`Webhook signature verification failed: ${errorMessage}`);
    return new Response(`Webhook Error: ${errorMessage}`, { status: 400 });
  }

  console.log(`[WEBHOOK] Event received: ${event.type}`);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[WEBHOOK] Checkout completed for customer: ${session.customer}`);

        const userId = session.metadata?.supabase_user_id;
        if (!userId) {
          console.error("No user ID in session metadata");
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
              subscription_active: true,
              subscription_current_period_end: subscription.current_period_end,
              is_member: true,
            })
            .eq("id", userId);

          console.log(`[WEBHOOK] Subscription activated for user ${userId}`);
          await logBillingEvent(supabase, userId, event.type, event.id, { subscriptionId: subscription.id });
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`[WEBHOOK] Payment succeeded for customer: ${invoice.customer}`);

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
                subscription_active: true,
                subscription_current_period_end: subscription.current_period_end,
                is_member: true,
              })
              .eq("id", profile.id);

            console.log(`[WEBHOOK] Subscription renewed for user ${profile.id}`);
            await logBillingEvent(supabase, profile.id, event.type, event.id, { invoiceId: invoice.id });
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`[WEBHOOK] Payment failed for customer: ${invoice.customer}`);

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
              is_member: false,
            })
            .eq("id", profile.id);

          console.log(`[WEBHOOK] Subscription deactivated for user ${profile.id} due to payment failure`);
          await logBillingEvent(supabase, profile.id, event.type, event.id, { invoiceId: invoice.id });
          
          // Create notification
          await supabase.rpc('create_notification', {
            p_user_id: profile.id,
            p_type: 'payment_failed',
            p_title: 'Payment Failed',
            p_message: 'Your membership payment did not go through. Please update your payment method to continue unlimited use.',
            p_link: '/billing',
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`[WEBHOOK] Subscription updated: ${subscription.id}, status: ${subscription.status}`);

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
              subscription_current_period_end: subscription.current_period_end,
              is_member: isActive,
            })
            .eq("id", profile.id);

          console.log(`[WEBHOOK] Subscription status updated for user ${profile.id}: ${isActive ? 'active' : 'inactive'}`);
          await logBillingEvent(supabase, profile.id, event.type, event.id, { subscriptionId: subscription.id, status: subscription.status });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`[WEBHOOK] Subscription deleted: ${subscription.id}`);

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
              is_member: false,
            })
            .eq("id", profile.id);

          console.log(`[WEBHOOK] Subscription cancelled for user ${profile.id}`);
          await logBillingEvent(supabase, profile.id, event.type, event.id, { subscriptionId: subscription.id });
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[WEBHOOK] Error processing event: ${errorMessage}`);
    await logBillingEvent(supabase, null, event.type, event.id, event.data.object, error);
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
