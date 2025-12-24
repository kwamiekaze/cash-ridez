import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Initial TwiML Handler - First response when Twilio connects a call.
 * 
 * CRITICAL: Uses ONLY the pre-recorded outbound MP3 from GitHub.
 * NO ElevenLabs, NO Twilio <Say>, NO Polly, NO AI voice generation.
 * NO redirects to other voice handlers for outbound.
 * 
 * AUTHORITATIVE AUDIO URL:
 * https://raw.githubusercontent.com/kwamiekaze/cashridez-voicemail/main/cashridez_outbound.mp3
 * 
 * Flow: Play MP3 → Pause 3 seconds → Hangup
 * On ANY error: hangup silently - NEVER substitute a voice.
 */

// HARDCODED GitHub MP3 URL - DO NOT CHANGE
const OUTBOUND_MP3_URL = "https://raw.githubusercontent.com/kwamiekaze/cashridez-voicemail/main/cashridez_outbound.mp3";
const VOICEMAIL_MP3_URL = "https://raw.githubusercontent.com/kwamiekaze/cashridez-voicemail/main/cashridez_voicemail.mp3";

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

    console.log(`[call-center-twiml] CallSid=${callSid}, Direction=${direction}, Mode=${callMode}`);

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

    // Build TwiML based on call direction and mode
    let twiml: string;

    if (isOutbound) {
      // OUTBOUND CALLS: Always play the outbound MP3, pause, hangup
      // If mode is 'live', we skip recording and just connect (no audio playback)
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
        // Recording mode (default): Play outbound MP3 and hangup
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Record recordingStatusCallback="${APP_BASE_URL}/functions/v1/call-center-recording"
            recordingStatusCallbackMethod="POST"
            trim="trim-silence" />
  </Start>
  <Play>${OUTBOUND_MP3_URL}</Play>
  <Pause length="3"/>
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

    console.log(`[call-center-twiml] Returning TwiML (first 200 chars): ${twiml.slice(0, 200)}`);

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });

  } catch (error) {
    console.error('[call-center-twiml] TwiML generation error:', error);
    
    // On error: play outbound MP3 and hangup (no voice fallback)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${OUTBOUND_MP3_URL}</Play>
  <Pause length="3"/>
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
