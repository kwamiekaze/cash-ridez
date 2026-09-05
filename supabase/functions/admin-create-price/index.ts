import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminToken = Deno.env.get("ADMIN_SETUP_TOKEN");
    const provided = req.headers.get("x-admin-token");
    if (!adminToken || !provided || provided !== adminToken) {
      console.warn("[CREATE-PRICE] Unauthorized attempt");
      return json({ error: "Unauthorized" }, 401);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const currentPriceId = Deno.env.get("STRIPE_PRICE_ID");
    if (!stripeKey) return json({ error: "Missing STRIPE_SECRET_KEY" }, 500);
    if (!currentPriceId) return json({ error: "Missing STRIPE_PRICE_ID" }, 500);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Derive the product from the current price (never hardcoded)
    const currentPrice = await stripe.prices.retrieve(currentPriceId);
    const productId =
      typeof currentPrice.product === "string"
        ? currentPrice.product
        : currentPrice.product.id;
    console.log("[CREATE-PRICE] Product derived from current price:", productId);

    // Idempotency: reuse an existing matching price if present
    const existing = await stripe.prices.list({ product: productId, active: true, limit: 100 });
    const match = existing.data.find(
      (p) =>
        p.unit_amount === 199 &&
        p.currency === "usd" &&
        p.active === true &&
        p.recurring?.interval === "month",
    );

    let price = match;
    let created = false;
    if (!price) {
      price = await stripe.prices.create({
        product: productId,
        unit_amount: 199,
        currency: "usd",
        recurring: { interval: "month" },
      });
      created = true;
      console.log("[CREATE-PRICE] Created new price:", price.id);
    } else {
      console.log("[CREATE-PRICE] Reusing existing price:", price.id);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { error: upsertError } = await supabase
      .from("app_config")
      .upsert(
        { key: "membership_price_id", value: price.id, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (upsertError) {
      console.error("[CREATE-PRICE] Failed to store price id:", upsertError);
      return json({ error: `Price ${price.id} created but not stored: ${upsertError.message}` }, 500);
    }

    return json({
      created,
      priceId: price.id,
      productId,
      unitAmount: price.unit_amount,
      currency: price.currency,
      interval: price.recurring?.interval ?? null,
    });
  } catch (error) {
    const err = error as any;
    console.error("[CREATE-PRICE] Error:", err?.message ?? String(error));
    return json({ error: err?.message ?? "Unknown error" }, 500);
  }
});
