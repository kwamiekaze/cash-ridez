import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * CRITICAL: This endpoint MUST return valid TwiML XML within 1-2 seconds.
 * NO AI calls, NO ElevenLabs calls - those happen in call-center-ai endpoint.
 * Always return Content-Type: text/xml
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
    let firstName = 'there';

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
      firstName = url.searchParams.get('firstName') || 'there';
      callSid = url.searchParams.get('CallSid') || '';
    }

    console.log(`TwiML request: CallSid=${callSid}, From=${from}, Direction=${direction}, callLogId=${callLogId}`);

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
      // OUTBOUND: We called them. Speak greeting, record, and redirect to AI handler.
      // Use <Say> first for immediate audio, then redirect to AI endpoint
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello! This is Cash Ridez Connect LLC. We responded to your Indeed application.</Say>
  <Pause length="1"/>
  <Say voice="alice">Please hold while I connect you.</Say>
  <Redirect method="POST">${APP_BASE_URL}/functions/v1/call-center-ai?callSid=${encodeURIComponent(callSid)}&amp;firstName=${encodeURIComponent(firstName)}</Redirect>
</Response>`;
    } else {
      // INBOUND: Someone is calling us. Greet them and offer to take a message.
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling Cash Ridez Connect LLC.</Say>
  <Pause length="1"/>
  <Say voice="alice">For faster service, please text the word CASH to this number, and a team member will assist you shortly.</Say>
  <Say voice="alice">You can also leave a message after the beep.</Say>
  <Record maxLength="60" 
          playBeep="true"
          recordingStatusCallback="${APP_BASE_URL}/functions/v1/call-center-recording"
          recordingStatusCallbackMethod="POST"
          transcribe="true"/>
  <Say voice="alice">Thank you for your message. Goodbye!</Say>
  <Hangup/>
</Response>`;
    }

    console.log('Returning TwiML:', twiml.substring(0, 200) + '...');

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });

  } catch (error) {
    console.error('TwiML generation error:', error);
    
    // ALWAYS return valid TwiML even on error
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We apologize, but we're experiencing technical difficulties. Please text CASH to this number to continue.</Say>
  <Hangup/>
</Response>`;

    return new Response(fallbackTwiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  }
});
