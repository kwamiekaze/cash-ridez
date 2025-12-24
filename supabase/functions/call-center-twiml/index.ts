import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Initial TwiML Handler - First response when Twilio connects a call.
 * 
 * CRITICAL: Uses ONLY the pre-recorded outbound MP3 from GitHub.
 * NO ElevenLabs, NO Twilio <Say>, NO Polly, NO AI voice generation.
 * NO redirects to other voice handlers for outbound.
 * 
 * AUTHORITATIVE AUDIO URLS:
 * - Outbound (human): https://github.com/kwamiekaze/cashridez-voicemail/raw/refs/heads/main/cashridez_outbound.mp3
 * - Voicemail: https://github.com/kwamiekaze/cashridez-voicemail/raw/refs/heads/main/cashridez_voicemail.mp3
 * 
 * HUMAN-LIKE FLOW (recording mode):
 * 1. Use <Gather input="speech"> to listen for caller's greeting (up to 2 seconds)
 * 2. When caller finishes speaking OR timeout, redirect to gather-complete
 * 3. Gather-complete plays the MP3 and hangs up
 * 
 * On ANY error: hangup silently - NEVER substitute a voice.
 */

// HARDCODED GitHub MP3 URLs - DO NOT CHANGE
const OUTBOUND_MP3_URL = "https://github.com/kwamiekaze/cashridez-voicemail/raw/refs/heads/main/cashridez_outbound.mp3";
const VOICEMAIL_MP3_URL = "https://github.com/kwamiekaze/cashridez-voicemail/raw/refs/heads/main/cashridez_voicemail.mp3";

const APP_BASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';

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

  const startTime = Date.now();

  try {
    // Parse request - could be form data from Twilio or JSON
    let callSid = '';
    let from = '';
    let to = '';
    let direction = 'inbound';
    let callLogId = '';
    let firstName = '';
    let callMode = 'recording'; // 'recording' or 'live'

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
      callMode = url.searchParams.get('mode') || 'recording';
    }

    // Also check URL params for form data requests
    const url = new URL(req.url);
    callLogId = callLogId || url.searchParams.get('callLogId') || '';
    firstName = firstName || url.searchParams.get('firstName') || '';
    callMode = callMode || url.searchParams.get('mode') || 'recording';

    console.log(`[call-center-twiml] CallSid=${callSid}, Direction=${direction}, Mode=${callMode}, StartTime=${startTime}`);

    // Log to database in background (don't block response)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Log TwiML request
    if (callSid) {
      supabase.from('call_center_messages').insert({
        twilio_call_sid: callSid,
        role: 'system',
        content: `[TwiML requested] Direction: ${direction}, Mode: ${callMode}`,
        provider: 'twilio-twiml',
        metadata: {
          direction,
          call_mode: callMode,
          timestamp: new Date().toISOString(),
        },
      }).then(({ error }) => {
        if (error) console.error('[call-center-twiml] Failed to log:', error);
      });
    }

    // Determine if this is outbound (we initiated) or inbound (someone calling us)
    const isOutbound = direction === 'outbound-api' || direction === 'outbound';

    // Build TwiML based on call direction and mode
    let twiml: string;

    if (isOutbound) {
      // OUTBOUND CALLS
      if (callMode === 'live') {
        // Live mode: Start recording and wait for human interaction
        // This is for "Speak Live" option - no pre-recorded message
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Record recordingStatusCallback="${APP_BASE_URL}/functions/v1/call-center-recording"
            recordingStatusCallbackMethod="POST"
            trim="trim-silence" />
  </Start>
  <Pause length="60"/>
  <Hangup/>
</Response>`;
      } else {
        // Recording mode (default): Use human-like Gather flow
        // 1. Start recording for call logging
        // 2. Use <Gather> to listen for caller's greeting (up to 2 seconds)
        // 3. When caller finishes speaking OR timeout, hit gather-complete action URL
        // 4. Gather-complete plays the MP3 and hangs up
        const gatherActionUrl = `${APP_BASE_URL}/functions/v1/call-center-gather-complete?callSid=${encodeURIComponent(callSid)}`;
        
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Record recordingStatusCallback="${APP_BASE_URL}/functions/v1/call-center-recording"
            recordingStatusCallbackMethod="POST"
            trim="trim-silence" />
  </Start>
  <Gather input="speech" timeout="2" speechTimeout="auto" action="${escapeXml(gatherActionUrl)}" method="POST">
  </Gather>
  <!-- Fallback if Gather fails: play MP3 immediately -->
  <Play>${OUTBOUND_MP3_URL}</Play>
  <Pause length="1"/>
  <Hangup/>
</Response>`;
      }
    } else {
      // INBOUND CALLS: Wait briefly then redirect to voicemail handler
      // The voicemail handler will play the voicemail MP3
      const voicemailUrl = `${APP_BASE_URL}/functions/v1/call-inbound-voicemail?callSid=${encodeURIComponent(callSid)}`;
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="20"/>
  <Redirect method="POST">${escapeXml(voicemailUrl)}</Redirect>
</Response>`;
    }

    console.log(`[call-center-twiml] Returning TwiML (first 300 chars): ${twiml.slice(0, 300)}, latency=${Date.now() - startTime}ms`);

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });

  } catch (error) {
    console.error('[call-center-twiml] TwiML generation error:', error);
    
    // On error: play outbound MP3 directly and hangup (no voice fallback)
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

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
