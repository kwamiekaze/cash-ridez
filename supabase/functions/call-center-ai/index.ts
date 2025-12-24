import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Outbound Call AI/Voice Handler - Called for ANSWERED outbound calls.
 * 
 * CRITICAL: Uses ONLY the pre-recorded outbound MP3 from GitHub.
 * NO ElevenLabs, NO Twilio <Say>, NO Polly, NO AI voice generation.
 * 
 * AUTHORITATIVE AUDIO URL:
 * https://raw.githubusercontent.com/kwamiekaze/cashridez-voicemail/main/cashridez_outbound.mp3
 * 
 * After playback: 1 second pause, then hangup.
 * On ANY error: hangup silently - NEVER substitute a voice.
 */

// HARDCODED GitHub MP3 URL - DO NOT CHANGE
const OUTBOUND_MP3_URL = "https://raw.githubusercontent.com/kwamiekaze/cashridez-voicemail/main/cashridez_outbound.mp3";

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

  try {
    // Parse incoming request (Twilio sends form data)
    let callSid = '';
    let firstName = '';
    let isInbound = false;
    
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      callSid = formData.get('CallSid') as string || '';
    }
    
    // Also check URL params
    const url = new URL(req.url);
    callSid = callSid || url.searchParams.get('callSid') || url.searchParams.get('CallSid') || '';
    firstName = url.searchParams.get('firstName') || '';
    isInbound = url.searchParams.get('inbound') === 'true';

    console.log(`[call-center-ai] CallSid=${callSid}, FirstName=${firstName}, Inbound=${isInbound}`);
    console.log(`[call-center-ai] Playing outbound MP3: ${OUTBOUND_MP3_URL}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Log the message
    if (callSid) {
      const { error: logError } = await supabase.from('call_center_messages').insert({
        twilio_call_sid: callSid,
        role: 'assistant',
        content: '[Played outbound recording: cashridez_outbound.mp3]',
        provider: 'prerecorded-github',
      });
      if (logError) console.error('[call-center-ai] Failed to log message:', logError);
    }

    // Build TwiML response - ONLY Play MP3, Pause, Hangup
    // NO <Say> elements. NO fallbacks.
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${OUTBOUND_MP3_URL}</Play>
  <Pause length="1"/>
  <Hangup/>
</Response>`;

    console.log('[call-center-ai] Returning TwiML');

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });

  } catch (error) {
    console.error('[call-center-ai] CRITICAL error:', error);
    
    // On error: STILL try to play outbound, then hangup
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${OUTBOUND_MP3_URL}</Play>
  <Pause length="1"/>
  <Hangup/>
</Response>`;

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
});
