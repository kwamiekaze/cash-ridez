import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    console.log('[CHECK-SUB] Function started');

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    
    console.log('[CHECK-SUB] Checking subscription for user:', user.id);

    // Get user profile
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('stripe_customer_id, stripe_subscription_id, subscription_active, completed_trips_count')
      .eq('id', user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      console.log('[CHECK-SUB] No customer found');
      return new Response(JSON.stringify({ 
        subscribed: false,
        completed_trips: profile?.completed_trips_count || 0,
        trips_remaining: Math.max(0, 3 - (profile?.completed_trips_count || 0))
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if subscription exists and is active
    if (profile.stripe_subscription_id) {
      try {
        const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
        const isActive = ['active', 'trialing'].includes(subscription.status);

        // Update local state if it doesn't match
        if (isActive !== profile.subscription_active) {
          await supabaseClient
            .from("profiles")
            .update({
              subscription_active: isActive,
              subscription_current_period_end: subscription.current_period_end,
              is_member: isActive,
            })
            .eq("id", user.id);
        }

        console.log('[CHECK-SUB] Subscription status:', subscription.status);

        return new Response(JSON.stringify({
          subscribed: isActive,
          subscription_end: new Date(subscription.current_period_end * 1000).toISOString(),
          completed_trips: profile.completed_trips_count || 0,
          trips_remaining: isActive ? 'unlimited' : Math.max(0, 3 - (profile.completed_trips_count || 0))
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } catch (error) {
        console.error('[CHECK-SUB] Error fetching subscription:', error);
        // Subscription might have been cancelled
        await supabaseClient
          .from("profiles")
          .update({
            subscription_active: false,
            is_member: false,
          })
          .eq("id", user.id);
      }
    }

    return new Response(JSON.stringify({ 
      subscribed: false,
      completed_trips: profile.completed_trips_count || 0,
      trips_remaining: Math.max(0, 3 - (profile.completed_trips_count || 0))
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[CHECK-SUB] ERROR:', errorMessage);
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
