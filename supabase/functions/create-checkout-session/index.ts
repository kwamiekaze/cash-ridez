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

  try {
    console.log("[CHECKOUT] Incoming create-checkout-session request");

    // Validate environment variables first
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const priceId = Deno.env.get("STRIPE_PRICE_ID");

    console.log("[CHECKOUT] Has STRIPE_SECRET_KEY:", !!stripeKey);
    console.log("[CHECKOUT] STRIPE_PRICE_ID:", priceId);

    if (!stripeKey) {
      throw new Error("Missing STRIPE_SECRET_KEY in Edge Function environment");
    }
    if (!priceId) {
      throw new Error("Missing STRIPE_PRICE_ID in Edge Function environment");
    }

    // Validate Stripe key format
    if (stripeKey.startsWith("rk_")) {
      throw new Error("STRIPE_SECRET_KEY appears to be a restricted key (rk_). Please use a standard secret key (sk_)");
    }
    if (!stripeKey.startsWith("sk_")) {
      throw new Error("STRIPE_SECRET_KEY must start with 'sk_' (standard secret key)");
    }

    console.log("[CHECKOUT] Stripe key format validated (sk_...)");

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError) {
      console.error("[CHECKOUT] Auth error:", userError);
      throw new Error(`Authentication error: ${userError.message}`);
    }
    
    const user = userData.user;
    if (!user?.email) {
      throw new Error("User not authenticated or email not available");
    }
    
    console.log("[CHECKOUT] User authenticated:", user.id, user.email);

    // Parse request body
    let body: any = {};
    try {
      body = await req.json();
      console.log("[CHECKOUT] Request body:", body);
    } catch (e) {
      console.log("[CHECKOUT] No request body or parsing failed, using defaults");
    }

    // Get user profile
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('stripe_customer_id, subscription_active')
      .eq('id', user.id)
      .single();

    console.log("[CHECKOUT] User profile:", { 
      hasCustomerId: !!profile?.stripe_customer_id,
      subscriptionActive: profile?.subscription_active 
    });

    // Initialize Stripe
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    console.log("[CHECKOUT] Stripe initialized");

    let customerId = profile?.stripe_customer_id;

    // Create or retrieve customer
    if (!customerId) {
      console.log("[CHECKOUT] Creating new Stripe customer");
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;
      
      await supabaseClient
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
        
      console.log("[CHECKOUT] Created customer:", customerId);
    } else {
      console.log("[CHECKOUT] Using existing customer:", customerId);
    }

    // Verify price exists in Stripe
    console.log("[CHECKOUT] Verifying price exists in Stripe:", priceId);
    const price = await stripe.prices.retrieve(priceId);
    console.log("[CHECKOUT] Price verified:", {
      id: price.id,
      product: price.product,
      active: price.active,
      currency: price.currency,
      unit_amount: price.unit_amount
    });
    
    if (!price.active) {
      throw new Error(`Price ${priceId} exists but is not active in Stripe`);
    }

    // Determine URLs
    const origin = req.headers.get("origin") || "https://cashridez.com";
    const successUrl = body.success_url || `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = body.cancel_url || `${origin}/billing/cancelled`;
    
    console.log("[CHECKOUT] Creating checkout session with URLs:", { successUrl, cancelUrl });

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        supabase_user_id: user.id,
      },
    });

    console.log("[CHECKOUT] Created session:", session.id, "URL:", session.url);

    // Log billing event
    try {
      await supabaseClient.from('billing_logs').insert({
        user_id: user.id,
        event_type: 'checkout_session_created',
        request_body: { priceId },
        response_body: { sessionId: session.id, url: session.url },
        error_code: null,
        error_message: null,
      });
    } catch (logErr) {
      console.error('[CHECKOUT] Failed to log billing event:', logErr);
    }

    return new Response(
      JSON.stringify({ url: session.url }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (error) {
    const err = error as any;
    console.error("[CHECKOUT] Error creating checkout session:", {
      message: err.message,
      type: err.type,
      code: err.code,
      statusCode: err.statusCode,
      stack: err.stack
    });
    
    return new Response(
      JSON.stringify({
        error: err.message || String(error) || "Unknown error",
        code: err.code || "unknown_error",
        type: err.type || "unknown_type"
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
