import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { safeReturnUrl } from "../_shared/membership.ts";
import {
  AmbiguousCustomerError,
  loadProfileOrThrow,
  resolveAppOrigin,
  resolveCustomerForUser,
} from "../_shared/billing-core.ts";

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

    // A profile read error aborts: we must never "recover" a customer from a
    // failed lookup, and never bind one by email alone.
    const profile = await loadProfileOrThrow(supabaseClient, user.id);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // The portal stays reachable for past_due / canceled / inactive members so
    // they can fix payment — but only for a customer proven to be theirs.
    const customerId = await resolveCustomerForUser(
      stripe,
      supabaseClient,
      { id: user.id, email: user.email },
      profile,
      { createIfMissing: false },
    );

    if (!customerId) {
      return json(
        {
          error: "No billing account found yet. Subscribe first to manage billing.",
          code: "no_billing_account",
        },
        404,
      );
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const origin = resolveAppOrigin(req.headers.get("origin"));
    const returnUrl = safeReturnUrl(body?.return_url, origin, "/subscription");

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    console.log("[PORTAL] Session created:", portalSession.id);

    return json({ url: portalSession.url }, 200);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[PORTAL] ERROR:", errorMessage);

    if (error instanceof AmbiguousCustomerError) {
      return json(
        {
          error: "We could not safely match your billing account. Please contact support.",
          code: "ambiguous_customer",
        },
        409,
      );
    }

    return json({ error: errorMessage }, 500);
  }
});
