import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * AI/Voice Handler - Called AFTER initial TwiML response for ANSWERED outbound calls.
 * 
 * CRITICAL: Uses PRE-GENERATED audio stored in call_center_audio bucket.
 * This ensures the EXACT SAME male ElevenLabs voice plays every time with zero latency.
 * 
 * OUTBOUND SCRIPT (exact):
 * "Hey there, this is Cash Ridez Connect LLC. We responded on Indeed as well. 
 *  Please text us back with the word CASH for the next steps. We look forward to your text, thank you."
 * 
 * Then 3-second pause, then hangup. NO "goodbye". NO Q&A.
 * 
 * CRITICAL: NO <Say> elements in this file. If audio fails, just hangup.
 */

const APP_BASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';

// Pre-generated audio URL (seeded via call-center-seed-audio function)
const ANSWERED_AUDIO_PATH = 'outbound_answered.mp3';

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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get the pre-generated audio URL from the public bucket
    const { data: publicUrlData } = supabase.storage
      .from('call_center_audio')
      .getPublicUrl(ANSWERED_AUDIO_PATH);

    const audioUrl = publicUrlData?.publicUrl;

    // The script text (for logging only - actual audio is pre-generated)
    const scriptText = 'Hey there, this is Cash Ridez Connect LLC. We responded on Indeed as well. Please text us back with the word CASH for the next steps. We look forward to your text, thank you.';

    // Log the assistant message
    if (callSid) {
      const { error: logError } = await supabase.from('call_center_messages').insert({
        twilio_call_sid: callSid,
        role: 'assistant',
        content: scriptText,
        provider: 'elevenlabs-pregenerated',
      });
      if (logError) console.error('[call-center-ai] Failed to log message:', logError);
    }

    // Build TwiML response - ONLY use pre-generated audio, NO <Say> fallbacks
    let twiml: string;

    if (audioUrl) {
      console.log('[call-center-ai] Using pre-generated audio:', audioUrl);
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${escapeXml(audioUrl)}</Play>
  <Pause length="3"/>
  <Hangup/>
</Response>`;
    } else {
      // NO POLLY/SAY FALLBACK - if audio is missing, just hangup
      console.error('[call-center-ai] CRITICAL: Pre-generated audio not found! Hanging up (no TTS fallback).');
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;
    }

    console.log('[call-center-ai] Returning TwiML');

    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('[call-center-ai] CRITICAL error:', error);
    
    // On error, just hangup - NO TTS/Polly fallback ever
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
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
