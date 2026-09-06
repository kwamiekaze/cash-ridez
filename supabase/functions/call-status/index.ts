// ============================================================================
// TWILIO STATUS WEBHOOK FOR CASHRIDEZ
// ============================================================================
// Receives parent-leg status callbacks, <Number> child-leg status callbacks and
// the <Dial> action outcome. Every request is signature-verified against the
// canonical URL before any database use. Which leg a callback belongs to is
// decided by SID ownership, never by the `leg` query parameter.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import twilio from "npm:twilio@5.3.5";
import {
  handleStatusCallback,
  MissingDependencyError,
  RetryableCallError,
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const contentType = req.headers.get("content-type") ?? "";

    if (req.method !== "POST" || !contentType.includes("application/x-www-form-urlencoded")) {
      return json({ error: "method_not_allowed" }, 405);
    }

    const params = formDataToParams(await req.formData());
    const signedUrl = canonicalFunctionUrl(supabaseUrl, "/functions/v1/call-status", req.url);
    const signatureValid = await verifyTwilioSignature({
      authToken,
      signature: req.headers.get("x-twilio-signature"),
      url: signedUrl,
      params,
    });

    const client = accountSid && authToken ? twilio(accountSid, authToken) : null;
    const twilioPort: TwilioPort = {
      createCall: async () => {
        throw new Error("not supported in call-status");
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
    };

    const result = await handleStatusCallback(
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
      { method: req.method, contentType, params, query: new URL(req.url).searchParams, signatureValid },
    );

    return json(result.body, result.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[call-status] Failed:", message);
    // Retryable problems must NOT be acknowledged as processed.
    if (error instanceof RetryableCallError || error instanceof MissingDependencyError) {
      return json({ error: "retryable", retry: true }, 503);
    }
    return json({ error: "processing_failed" }, 500);
  }
});
