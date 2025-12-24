import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Voicemail Handler - Called when AMD detects answering machine (outbound calls).
 * 
 * CRITICAL: When leaving a voicemail, play the VOICEMAIL MP3.
 * This is a shorter message optimized for voicemail systems.
 * 
 * NO ElevenLabs, NO Twilio <Say>, NO Polly, NO fallback voices.
 * 
 * AUTHORITATIVE VOICEMAIL AUDIO URL (message to leave on voicemail):
 * https://github.com/kwamiekaze/cashridez-voicemail/raw/refs/heads/main/cashridez_voicemail.mp3
 * 
 * After playback: 1-2 second pause, then hangup.
 * On ANY error: hangup silently - NEVER substitute a voice.
 */

// HARDCODED GitHub MP3 URL - DO NOT CHANGE
// This is the VOICEMAIL message to leave (shorter, voicemail-optimized)
const VOICEMAIL_MP3_URL = "https://github.com/kwamiekaze/cashridez-voicemail/raw/refs/heads/main/cashridez_voicemail.mp3";

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
    // Parse request
    let callSid = '';
    let firstName = '';

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      callSid = formData.get('CallSid') as string || '';
    }

    const url = new URL(req.url);
    callSid = callSid || url.searchParams.get('callSid') || '';
    firstName = url.searchParams.get('firstName') || '';

    console.log(`[call-center-voicemail] CallSid=${callSid}, FirstName=${firstName}`);
    console.log(`[call-center-voicemail] Playing VOICEMAIL MP3: ${VOICEMAIL_MP3_URL}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Update call log to indicate voicemail
    if (callSid) {
      try {
        await supabase
          .from('admin_call_logs')
          .update({
            voicemail_left: true,
            status: 'voicemail'
          })
          .eq('twilio_call_sid', callSid);

        // Also update campaign recipient if exists
        await supabase
          .from('admin_call_campaign_recipients')
          .update({
            status: 'voicemail',
            voicemail_left: true
          })
          .eq('twilio_call_sid', callSid);
      } catch (dbErr) {
        console.error('[call-center-voicemail] DB update failed:', dbErr);
      }
    }

    // Log the voicemail
    if (callSid) {
      const { error: logError } = await supabase.from('call_center_messages').insert({
        twilio_call_sid: callSid,
        role: 'assistant',
        content: '[Left voicemail: cashridez_voicemail.mp3]',
        provider: 'prerecorded-github',
        metadata: {
          action: 'voicemail_play',
          mp3_url: VOICEMAIL_MP3_URL,
          timestamp: new Date().toISOString(),
        },
      });
      if (logError) console.error('[call-center-voicemail] Failed to log message:', logError);
    }

    // Build TwiML response - Play VOICEMAIL MP3 from the START
    // Hang up 1-2 seconds after it ends
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${VOICEMAIL_MP3_URL}</Play>
  <Pause length="2"/>
  <Hangup/>
</Response>`;

    console.log(`[call-center-voicemail] Returning TwiML, latency=${Date.now() - startTime}ms`);

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });

  } catch (error) {
    console.error('[call-center-voicemail] Handler error:', error);

    // On error: STILL play voicemail message, no fallback voice
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${VOICEMAIL_MP3_URL}</Play>
  <Pause length="2"/>
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
