import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createMembershipCheckout } from "../_shared/checkout-core.ts";
import { resolveAppOrigin, AmbiguousCustomerError } from "../_shared/billing-core.ts";
import { MembershipConfigError, requireMembershipPriceId } from "../_shared/membership.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("Missing STRIPE_SECRET_KEY in Edge Function environment");
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

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const result = await createMembershipCheckout(
      {
        stripe,
        supabase: supabaseClient,
        resolveMembershipPriceId: () => requireMembershipPriceId(supabaseClient),
      },
      {
        user: { id: user.id, email: user.email },
        origin: resolveAppOrigin(req.headers.get("origin")),
        successUrl: body?.success_url,
        cancelUrl: body?.cancel_url ?? body?.return_url,
      },
    );

    return json(result.body, result.status);
  } catch (error) {
    const err = error as any;
    console.error("[CHECKOUT] Error:", { message: err?.message, type: err?.type, code: err?.code });

    if (error instanceof AmbiguousCustomerError) {
      return json(
        {
          error: "We could not safely match your billing account. Please contact support.",
          code: "ambiguous_customer",
        },
        409,
      );
    }

    const status = error instanceof MembershipConfigError ? 503 : 500;
    return json(
      {
        error: err?.message || "Unknown error",
        code: err?.code || "unknown_error",
      },
      status,
    );
  }
});
