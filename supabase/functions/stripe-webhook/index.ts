// ============================================================================
// STRIPE WEBHOOK ENDPOINT FOR CASHRIDEZ
// ============================================================================
//
// WEBHOOK URL: <project>/functions/v1/stripe-webhook
//
// SIGNING SECRETS (any configured one is accepted):
//   - STRIPE_WEBHOOK_SECRET           (legacy endpoint)
//   - STRIPE_WEBHOOK_SECRET_SNAPSHOT  (snapshot endpoint)
//   - STRIPE_WEBHOOK_SECRET_THIN      (thin endpoint)
//
// This file is intentionally thin: signature verification only. All decision
// logic lives in ../_shared/webhook-core.ts so it can be unit tested.
// ============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { handleStripeEvent } from "../_shared/webhook-core.ts";
import { resolveMembershipProductId } from "../_shared/membership.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");

  const secrets = [
    ["LEGACY", Deno.env.get("STRIPE_WEBHOOK_SECRET")],
    ["SNAPSHOT", Deno.env.get("STRIPE_WEBHOOK_SECRET_SNAPSHOT")],
    ["THIN", Deno.env.get("STRIPE_WEBHOOK_SECRET_THIN")],
  ].filter(([, value]) => !!value) as [string, string][];

  if (!signature) {
    console.error("[WEBHOOK] Missing Stripe-Signature header");
    return json({ error: "Missing signature" }, 400);
  }

  if (secrets.length === 0) {
    console.error("[WEBHOOK] No webhook signing secrets configured");
    return json({ error: "No webhook secrets configured" }, 500);
  }

  const body = await req.text();
  let event: Stripe.Event | null = null;
  let verifiedWith: string | null = null;

  for (const [name, secret] of secrets) {
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, secret, undefined, cryptoProvider);
      verifiedWith = name;
      break;
    } catch {
      // try the next configured secret
    }
  }

  if (!event) {
    console.error("[WEBHOOK] Signature verification failed against all configured secrets");
    return json({ error: "Invalid signature" }, 400);
  }

  console.log(`[WEBHOOK] ${event.type} (${event.id}) verified with ${verifiedWith} secret`);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const result = await handleStripeEvent(
    {
      stripe,
      supabase,
      resolveMembershipProductId: () => resolveMembershipProductId(stripe, supabase),
    },
    event,
  );

  return json(result.body, result.status);
});
