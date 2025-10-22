import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logBillingEvent = async (supabase: any, userId: string, eventType: string, requestBody: any, responseBody: any, error?: any) => {
  try {
    await supabase.from('billing_logs').insert({
      user_id: userId,
      event_type: eventType,
      request_body: requestBody,
      response_body: responseBody,
      error_code: error?.code || null,
      error_message: error?.message || null,
    });
  } catch (logError) {
    console.error('Failed to log billing event:', logError);
  }
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
    console.log('[CHECKOUT] Function started');

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
    if (!user?.email) throw new Error("User not authenticated or email not available");
    
    console.log('[CHECKOUT] User authenticated:', user.id, user.email);

    // Get user profile
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('stripe_customer_id, subscription_active')
      .eq('id', user.id)
      .single();

    console.log('[CHECKOUT] User profile:', profile);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let customerId = profile?.stripe_customer_id;

    // Create or retrieve customer
    if (!customerId) {
      console.log('[CHECKOUT] Creating new Stripe customer');
      try {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            supabase_user_id: user.id,
          },
        });
        customerId = customer.id;
        
        // Update profile with customer ID
        await supabaseClient
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', user.id);
          
        console.log('[CHECKOUT] Created customer:', customerId);
      } catch (error) {
        console.error('[CHECKOUT] Error creating customer:', error);
        await logBillingEvent(supabaseClient, user.id, 'customer_create_error', { email: user.email }, null, error);
        throw error;
      }
    } else {
      console.log('[CHECKOUT] Using existing customer:', customerId);
    }

    // IMPORTANT: This price_id should be replaced with your actual Stripe price ID
    // You can find this in your Stripe dashboard under Products
    const priceId = "price_1SLGZJDEimdSeEFoTaFHrQei"; // TODO: Replace with actual price ID

    const origin = req.headers.get("origin") || "https://cashridez.com";
    
    console.log('[CHECKOUT] Creating checkout session');
    
    try {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/billing/cancelled`,
        metadata: {
          supabase_user_id: user.id,
        },
      }, {
        idempotencyKey: `checkout-${user.id}-${Date.now()}`,
      });

      console.log('[CHECKOUT] Session created:', session.id);
      await logBillingEvent(supabaseClient, user.id, 'checkout_session_created', { priceId }, { sessionId: session.id, url: session.url });

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } catch (error) {
      console.error('[CHECKOUT] Error creating session:', error);
      await logBillingEvent(supabaseClient, user.id, 'checkout_session_error', { priceId }, null, error);
      
      // Provide helpful error messages
      let errorMessage = error.message;
      if (error.code === 'resource_missing') {
        errorMessage = 'Subscription plan not found. Please contact support.';
      } else if (error.type === 'StripePermissionError') {
        errorMessage = 'Stripe API key missing required permissions. Please contact support.';
      }
      
      throw new Error(errorMessage);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[CHECKOUT] ERROR:', errorMessage);
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      code: error.code || 'unknown_error'
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
