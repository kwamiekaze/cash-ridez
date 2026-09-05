import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { isActiveStatus, isGrantedPremium, isMembershipSubscription } from "../_shared/stripe-compat.ts";
import {
  MembershipConfigError,
  requireMembershipPriceId,
  safeReturnUrl,
} from "../_shared/membership.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_ORIGINS = [
  "https://cashridez.com",
  "https://www.cashridez.com",
  "https://cash-ridez.lovable.app",
];

/** Only accept an origin we recognise as this app. */
const resolveOrigin = (req: Request): string => {
  const origin = req.headers.get("origin") ?? "";
  if (APP_ORIGINS.includes(origin)) return origin;
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost" || host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com")) {
      return origin;
    }
  } catch {
    // ignore
  }
  return APP_ORIGINS[0];
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      throw new Error("Missing STRIPE_SECRET_KEY in Edge Function environment");
    }
    // Both standard (sk_) and restricted (rk_) keys are valid for Checkout.
    if (!stripeKey.startsWith("sk_") && !stripeKey.startsWith("rk_")) {
      throw new Error("STRIPE_SECRET_KEY must be a Stripe secret key (sk_ or rk_)");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);

    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    console.log("[CHECKOUT] Authenticated user:", user.id);

    // Never log the raw request payload — it is attacker-controlled.
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("stripe_customer_id, subscription_active, subscription_status, stripe_subscription_id")
      .eq("id", user.id)
      .single();

    // Price id: app_config first, STRIPE_PRICE_ID fallback. Either alone is fine.
    const effectivePriceId = await requireMembershipPriceId(supabaseClient);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const price = await stripe.prices.retrieve(effectivePriceId);
    if (!price.active) {
      throw new Error(`Membership price ${effectivePriceId} is not active in Stripe`);
    }
    const membershipProductId = typeof price.product === "string" ? price.product : (price.product as any)?.id;
    if (!membershipProductId) {
      throw new MembershipConfigError(`Membership price ${effectivePriceId} has no product`);
    }

    if (isGrantedPremium(profile)) {
      return new Response(
        JSON.stringify({ error: "You already have unlimited access.", code: "already_subscribed" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let customerId = profile?.stripe_customer_id as string | null;

    // Idempotent customer creation: reuse an existing Stripe customer for this
    // email/user before creating another one.
    if (!customerId) {
      const existing = await stripe.customers.list({ email: user.email, limit: 10 });
      const match = existing.data.find((c: any) => c.metadata?.supabase_user_id === user.id) ??
        existing.data[0];
      if (match) {
        customerId = match.id;
      } else {
        const customer = await stripe.customers.create(
          { email: user.email, metadata: { supabase_user_id: user.id } },
          { idempotencyKey: `cust:${user.id}` },
        );
        customerId = customer.id;
      }
      await supabaseClient.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
      console.log("[CHECKOUT] Customer resolved for user", user.id);
    }

    // Duplicate-membership protection: never sell a second active membership.
    const subs = await stripe.subscriptions.list({
      customer: customerId!,
      status: "all",
      limit: 20,
      expand: ["data.items.data.price"],
    });
    const activeMembership = subs.data.find(
      (s: any) => isActiveStatus(s.status) && isMembershipSubscription(s, membershipProductId),
    );
    if (activeMembership) {
      console.log("[CHECKOUT] Active membership already exists, refusing duplicate checkout");
      return new Response(
        JSON.stringify({
          error: "You already have an active membership.",
          code: "already_subscribed",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const origin = resolveOrigin(req);
    const successUrl = safeReturnUrl(
      body?.success_url,
      origin,
      "/billing/success?session_id={CHECKOUT_SESSION_ID}",
    );
    const cancelUrl = safeReturnUrl(body?.cancel_url ?? body?.return_url, origin, "/billing/cancelled");

    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId!,
        line_items: [{ price: effectivePriceId, quantity: 1 }],
        mode: "subscription",
        success_url: successUrl.includes("{CHECKOUT_SESSION_ID}")
          ? successUrl
          : `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        metadata: { supabase_user_id: user.id },
        subscription_data: { metadata: { supabase_user_id: user.id } },
      },
      { idempotencyKey: `checkout:${user.id}:${effectivePriceId}:${Math.floor(Date.now() / 60000)}` },
    );

    console.log("[CHECKOUT] Session created:", session.id);

    try {
      await supabaseClient.from("billing_logs").insert({
        user_id: user.id,
        event_type: "checkout_session_created",
        request_body: { priceId: effectivePriceId },
        response_body: { sessionId: session.id },
        error_code: null,
        error_message: null,
      });
    } catch (logErr) {
      console.error("[CHECKOUT] Failed to log billing event:", (logErr as any)?.message);
    }

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const err = error as any;
    console.error("[CHECKOUT] Error:", { message: err?.message, type: err?.type, code: err?.code });

    const status = error instanceof MembershipConfigError ? 503 : 500;
    return new Response(
      JSON.stringify({
        error: err?.message || "Unknown error",
        code: err?.code || "unknown_error",
        type: err?.type || "unknown_type",
      }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
