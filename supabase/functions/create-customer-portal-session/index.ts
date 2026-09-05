import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { safeReturnUrl } from "../_shared/membership.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_ORIGINS = [
  "https://cashridez.com",
  "https://www.cashridez.com",
  "https://cash-ridez.lovable.app",
];

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

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // The portal must remain reachable for past_due / canceled / inactive
    // members — anyone with a billing account can manage or fix payment.
    let customerId = profile?.stripe_customer_id as string | null;
    if (!customerId) {
      const existing = await stripe.customers.list({ email: user.email, limit: 10 });
      const match = existing.data.find((c: any) => c.metadata?.supabase_user_id === user.id) ??
        existing.data[0];
      if (match) {
        customerId = match.id;
        await supabaseClient.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
      }
    }

    if (!customerId) {
      return new Response(
        JSON.stringify({
          error: "No billing account found yet. Subscribe first to manage billing.",
          code: "no_billing_account",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const origin = resolveOrigin(req);
    const returnUrl = safeReturnUrl(body?.return_url, origin, "/subscription");

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    console.log("[PORTAL] Session created:", portalSession.id);

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[PORTAL] ERROR:", errorMessage);

    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
