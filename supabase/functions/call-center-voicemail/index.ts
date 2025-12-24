import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Voicemail Handler - Called when AMD detects answering machine (outbound calls).
 * 
 * CRITICAL: Uses ONLY the pre-recorded voicemail audio via PUBLIC Supabase Storage URL.
 * NO ElevenLabs, NO Twilio <Say>, NO fallback voices.
 * 
 * The audio is served directly from Supabase Storage public bucket:
 * ${SUPABASE_URL}/storage/v1/object/public/call_center_audio/cashridez_voicemail.mp3
 * 
 * This URL is:
 * - Public (no auth required)
 * - HTTPS
 * - Returns 200 OK with audio/mpeg
 * - No redirects
 * - Stable forever
 */

// Hardcoded voicemail <Play> URL (no runtime concatenation)
const VOICEMAIL_PLAY_URL = "https://wnajjqsqmrpwyffbpgsj.supabase.co/functions/v1/call-center-voicemail-audio";

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
    console.log(`[call-center-voicemail] Using voicemail audio endpoint: ${VOICEMAIL_PLAY_URL}`);

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
        content: '[Played pre-recorded voicemail: cashridez_voicemail.mp3]',
        provider: 'prerecorded',
      });
      if (logError) console.error('[call-center-voicemail] Failed to log message:', logError);
    }

    // Build TwiML response (ONLY Play + Pause + Hangup)
    const twiml = `<Response>
  <Play>${VOICEMAIL_PLAY_URL}</Play>
  <Pause length="3"/>
  <Hangup/>
</Response>`;

    const responseContentType = 'text/xml; charset=utf-8';
    console.log(`[call-center-voicemail] Returning TwiML (first 200 chars): ${twiml.slice(0, 200)}`);
    console.log(`[call-center-voicemail] Response Content-Type: ${responseContentType}`);

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': responseContentType,
        'Cache-Control': 'no-store',
      },
    });

  } catch (error) {
    console.error('[call-center-voicemail] Handler error:', error);

    // Even on error: return the exact voicemail TwiML (no <Say> fallback)
    const twiml = `<Response>
  <Play>${VOICEMAIL_PLAY_URL}</Play>
  <Pause length="3"/>
  <Hangup/>
</Response>`;

    const responseContentType = 'text/xml; charset=utf-8';
    console.log(`[call-center-voicemail] Returning TwiML (error path, first 200 chars): ${twiml.slice(0, 200)}`);
    console.log(`[call-center-voicemail] Response Content-Type (error path): ${responseContentType}`);

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': responseContentType,
        'Cache-Control': 'no-store',
      },
    });
  }
});

