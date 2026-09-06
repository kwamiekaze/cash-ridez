// ============================================================================
// TWILIO VOICE WEBHOOK FOR CASHRIDEZ
// ============================================================================
// Two modes, both behind Twilio signature verification:
//   1. MASKED CALLING (callId query param) — bridges the recipient derived
//      from the stored initiator and the trip's CURRENT participants.
//   2. CALL CENTER FALLBACK (no callId) — redirects to the pre-recorded
//      voicemail handler.
//
// NO <Say>, NO TTS, NO AI voice — pre-recorded MP3 handling only.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import twilio from "npm:twilio@5.3.5";
import {
  handleVoiceWebhook,
  hangupTwiml,
  TWIML_CONTENT_TYPE,
  type TwilioPort,
} from "../_shared/calling-core.ts";
import {
  canonicalFunctionUrl,
  formDataToParams,
  verifyTwilioSignature,
} from "../_shared/twilio-signature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const xml = (twiml: string, status = 200) =>
  new Response(twiml, {
    status,
    headers: { ...corsHeaders, "Content-Type": TWIML_CONTENT_TYPE, "Cache-Control": "no-store" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const contentType = req.headers.get("content-type") ?? "";

    if (req.method !== "POST" || !contentType.includes("application/x-www-form-urlencoded")) {
      return xml(hangupTwiml(), 405);
    }

    const params = formDataToParams(await req.formData());
    // The signed URL is rebuilt from TRUSTED config, not from proxy headers.
    const signedUrl = canonicalFunctionUrl(supabaseUrl, "/functions/v1/call-voice", req.url);
    const signatureValid = await verifyTwilioSignature({
      authToken,
      signature: req.headers.get("x-twilio-signature"),
      url: signedUrl,
      params,
    });

    const client = accountSid && authToken ? twilio(accountSid, authToken) : null;
    const twilioPort: TwilioPort = {
      createCall: async () => {
        throw new Error("not supported in call-voice");
      },
      fetchCall: async (sid) => {
        const call = await client!.calls(sid).fetch();
        return {
          sid: call.sid,
          accountSid: (call as any).accountSid,
          parentCallSid: (call as any).parentCallSid,
          status: (call as any).status,
        };
      },
    };

    const result = await handleVoiceWebhook(
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
      {
        method: req.method,
        contentType,
        params,
        query: new URL(req.url).searchParams,
        signatureValid,
      },
    );

    return xml(result.twiml, result.status);
  } catch (error) {
    // Never log TwiML or raw phone numbers.
    console.error("[call-voice] Failed:", error instanceof Error ? error.message : String(error));
    return xml(hangupTwiml(), 200);
  }
});
