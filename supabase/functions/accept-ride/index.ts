import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { handleAcceptRide, corsHeaders } from "../_shared/accept-core.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Trusted client — notifications only, never for accept_ride_atomic.
const service = createClient(SUPABASE_URL, SERVICE_KEY);

const userClient = (jwt: string) =>
  createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

serve((req) =>
  handleAcceptRide(req, {
    async getUser(jwt) {
      const { data, error } = await service.auth.getUser(jwt);
      if (error || !data?.user) return null;
      return { id: data.user.id };
    },

    // The RPC authorizes against auth.uid(), so it runs with the caller's JWT.
    async acceptRide(jwt, args) {
      return await userClient(jwt).rpc("accept_ride_atomic", args);
    },

    // No-op: the ride_requests open -> assigned database trigger owns the
    // participant and admin emails through the outbox worker. Sending here too
    // would duplicate mail (and would trust caller-shaped content).
    async notify() {
      return;
    },
  }).catch((e) => {
    console.error("accept-ride fatal", e);
    return new Response(JSON.stringify({ success: false, error: "Failed to accept ride" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }),
);
