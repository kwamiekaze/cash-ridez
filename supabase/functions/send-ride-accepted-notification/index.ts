// Legacy endpoint. Ride-accepted email delivery is owned by the database
// outbox (ride_requests open -> assigned trigger -> process-email-notifications).
// This function authenticates the caller, ignores the body completely, and
// sends nothing, so caller-supplied recipients or content can never be mailed.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Unauthorized" }, 401);
    const { data, error } = await service.auth.getUser(jwt);
    if (error || !data?.user) return json({ error: "Unauthorized" }, 401);

    return json({ status: "accepted", queued: true });
  } catch (err) {
    console.error("send-ride-accepted-notification error:", err);
    return json({ error: "Failed to accept notification" }, 500);
  }
});
