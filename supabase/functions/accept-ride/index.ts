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

    async notify({ rideId, driverId, etaMinutes }) {
      const { data: rideData } = await service
        .from("ride_requests")
        .select(
          "*, rider:profiles!ride_requests_rider_id_fkey(display_name, full_name, email, phone_number)",
        )
        .eq("id", rideId)
        .single();

      const { data: driverData } = await service
        .from("profiles")
        .select("display_name, full_name, email, phone_number")
        .eq("id", driverId)
        .single();

      if (!rideData?.rider || !driverData) return;

      await service.functions.invoke("send-ride-accepted-notification", {
        body: {
          riderEmail: rideData.rider.email,
          riderName: rideData.rider.full_name || rideData.rider.display_name || "Rider",
          riderPhone: rideData.rider.phone_number || "",
          driverEmail: driverData.email,
          driverName: driverData.full_name || driverData.display_name || "Driver",
          driverPhone: driverData.phone_number || "",
          pickupAddress: rideData.pickup_address,
          dropoffAddress: rideData.dropoff_address,
          pickupTime: rideData.pickup_time,
          etaMinutes,
          rideId,
        },
      });
    },
  }).catch((e) => {
    console.error("accept-ride fatal", e);
    return new Response(JSON.stringify({ success: false, error: "Failed to accept ride" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }),
);
