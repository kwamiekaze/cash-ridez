import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * CRITICAL: This endpoint MUST return valid TwiML XML within 1-2 seconds.
 * NO AI calls, NO ElevenLabs calls - those happen in call-center-ai endpoint.
 * Always return Content-Type: text/xml
 * 
 * IMPORTANT: No <Say> elements here - only silence and redirect.
 * This prevents the "robotic female voice" issue.
 */

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const APP_BASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';

  try {
    // Parse request - could be form data from Twilio or JSON
    let callSid = '';
    let from = '';
    let to = '';
    let direction = 'inbound';
    let callLogId = '';
    let firstName = '';

    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/x-www-form-urlencoded')) {
      // Twilio webhook POST with form data
      const formData = await req.formData();
      callSid = formData.get('CallSid') as string || '';
      from = formData.get('From') as string || '';
      to = formData.get('To') as string || '';
      direction = formData.get('Direction') as string || 'inbound';
    } else {
      // Check URL params
      const url = new URL(req.url);
      callLogId = url.searchParams.get('callLogId') || '';
      firstName = url.searchParams.get('firstName') || '';
      callSid = url.searchParams.get('CallSid') || '';
    }

    console.log(`TwiML request: CallSid=${callSid}, From=${from}, Direction=${direction}, callLogId=${callLogId}, firstName=${firstName}`);

    // Log to database in background (don't block response)
    if (callSid) {
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );
        
        // Upsert call log by CallSid
        await supabase
          .from('admin_call_logs')
          .update({ twilio_call_sid: callSid })
          .eq('twilio_call_sid', callSid);
      } catch (dbErr) {
        console.error('DB logging failed (non-blocking):', dbErr);
      }
    }

    // Determine if this is outbound (we initiated) or inbound (someone calling us)
    const isOutbound = direction === 'outbound-api' || direction === 'outbound';

    // Build TwiML based on call direction
    let twiml: string;

    if (isOutbound) {
      // OUTBOUND: We called them. 
      // NO <Say> here - just silence, start recording, and redirect to AI handler.
      // The AI handler will speak with the male ElevenLabs voice.
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Record recordingStatusCallback="${APP_BASE_URL}/functions/v1/call-center-recording"
            recordingStatusCallbackMethod="POST"
            trim="trim-silence" />
  </Start>
  <Pause length="1"/>
  <Redirect method="POST">${APP_BASE_URL}/functions/v1/call-center-ai?callSid=${encodeURIComponent(callSid)}&amp;firstName=${encodeURIComponent(firstName)}</Redirect>
</Response>`;
    } else {
      // INBOUND: Someone is calling us. 
      // For inbound, we still need some audio - use a simple pause then redirect
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Record recordingStatusCallback="${APP_BASE_URL}/functions/v1/call-center-recording"
            recordingStatusCallbackMethod="POST"
            trim="trim-silence" />
  </Start>
  <Pause length="1"/>
  <Redirect method="POST">${APP_BASE_URL}/functions/v1/call-center-ai?callSid=${encodeURIComponent(callSid)}&amp;firstName=${encodeURIComponent(firstName)}&amp;inbound=true</Redirect>
</Response>`;
    }

    console.log(`[call-center-twiml] Returning TwiML (first 200 chars): ${twiml.slice(0, 200)}`);

    const responseContentType = 'text/xml; charset=utf-8';
    console.log(`[call-center-twiml] Response Content-Type: ${responseContentType}`);

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': responseContentType,
        'Cache-Control': 'no-store',
      },
    });

  } catch (error) {
    console.error('TwiML generation error:', error);
    
    // Even on error, return valid TwiML with just a pause and hangup (no Say)
    // This ensures no Twilio voice plays
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="2"/>
  <Hangup/>
</Response>`;

    const responseContentType = 'text/xml; charset=utf-8';
    console.log(`[call-center-twiml] Returning TwiML (error path, first 200 chars): ${fallbackTwiml.slice(0, 200)}`);
    console.log(`[call-center-twiml] Response Content-Type (error path): ${responseContentType}`);

    return new Response(fallbackTwiml, {
      status: 200,
      headers: {
        'Content-Type': responseContentType,
        'Cache-Control': 'no-store',
      },
    });
  }
});
