// ============================================================================
// TWILIO CALL INITIATOR FOR CASHRIDEZ
// ============================================================================
// Thin wrapper: authenticates the caller, then delegates every decision to the
// dependency-injected core in ../_shared/calling-core.ts.
//
// ERROR CODES returned to the frontend:
//   NO_USER_PHONE, NO_RIDER_PHONE, NO_DRIVER_PHONE, INVALID_PHONE_FORMAT,
//   INVALID_DESTINATION_NUMBER, TRIP_NOT_ASSIGNED, NOT_PARTICIPANT,
//   TRIP_NOT_FOUND, UNAUTHORIZED, SERVER_CONFIG_ERROR, TWILIO_ERROR,
//   TWILIO_UNAVAILABLE, RATE_LIMITED, CALL_IN_PROGRESS
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import twilio from "npm:twilio@5.3.5";
import {
  MissingDependencyError,
  RetryableCallError,
  startMaskedCall,
  type TwilioPort,
} from "../_shared/calling-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ success: false, code: "UNAUTHORIZED", error: "Please log in to use in-app calling." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return json({ success: false, code: "UNAUTHORIZED", error: "Please log in to use in-app calling." }, 401);
    }

    let tripId = "";
    try {
      tripId = (await req.json())?.trip_id ?? "";
    } catch {
      return json({ success: false, code: "INVALID_REQUEST", error: "Invalid request format." }, 400);
    }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

    const twilioPort: TwilioPort = {
      createCall: async (params) => {
        const call = await client!.calls.create(params as any);
        return { sid: call.sid, accountSid: (call as any).accountSid, parentCallSid: (call as any).parentCallSid };
      },
      fetchCall: async (sid) => {
        const call = await client!.calls(sid).fetch();
        return {
          sid: call.sid,
          accountSid: (call as any).accountSid,
          parentCallSid: (call as any).parentCallSid,
          status: (call as any).status,
          to: (call as any).to,
          from: (call as any).from,
        };
      },
      cancelCall: async (sid) => {
        await client!.calls(sid).update({ status: "completed" } as any);
      },
    };

    const result = await startMaskedCall(
      {
        supabase: createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
          auth: { persistSession: false },
        }),
        twilio: twilioPort,
        env: {
          supabaseUrl,
          twilioAccountSid: accountSid,
          twilioAuthToken: authToken,
          twilioPhoneNumber: Deno.env.get("TWILIO_PHONE_NUMBER"),
        },
      },
      { userId: user.id, tripId },
    );

    return json(result.body, result.status);
  } catch (error) {
    // Never log raw numbers or TwiML; the message alone is enough.
    const message = error instanceof Error ? error.message : String(error);
    console.error("[call-start] Failed:", message);
    if (error instanceof MissingDependencyError) {
      // Calling is intentionally OFF until docs/pending-migrations/calling.sql
      // is applied. Never degrade into inserting a row or dialing.
      return json(
        { success: false, code: "CALLING_UNAVAILABLE", error: "Calling is temporarily unavailable." },
        503,
      );
    }
    if (error instanceof RetryableCallError) {
      return json({ success: false, code: "TWILIO_UNAVAILABLE", error: "Please try again in a moment." }, 503);
    }
    return json({ success: false, code: "UNKNOWN", error: "An unexpected error occurred." }, 500);
  }
});
