import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Voicemail Handler - Called when AMD detects answering machine (outbound calls).
 * 
 * CRITICAL: Uses PRE-GENERATED audio stored in call_center_audio bucket.
 * This ensures the EXACT SAME male ElevenLabs voice plays every time with zero latency.
 * 
 * OUTBOUND VOICEMAIL SCRIPT:
 * "Hey there, this is Cash Ridez Connect LLC. We responded on Indeed as well. 
 *  Please text us back with the word CASH for the next steps. We look forward to your text, thank you."
 * 
 * Then 3-second pause, then hangup. NO "goodbye".
 */

const APP_BASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';

// Pre-generated audio URL (seeded via call-center-seed-audio function)
const VOICEMAIL_AUDIO_PATH = 'outbound_voicemail.mp3';

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

    // Get the pre-generated audio URL from the public bucket
    const { data: publicUrlData } = supabase.storage
      .from('call_center_audio')
      .getPublicUrl(VOICEMAIL_AUDIO_PATH);

    const audioUrl = publicUrlData?.publicUrl;

    // Log the voicemail message
    const voicemailScript = 'Hey there, this is Cash Ridez Connect LLC. We responded on Indeed as well. Please text us back with the word CASH for the next steps. We look forward to your text, thank you.';
    if (callSid) {
      const { error: logError } = await supabase.from('call_center_messages').insert({
        twilio_call_sid: callSid,
        role: 'assistant',
        content: voicemailScript,
        provider: 'elevenlabs-pregenerated',
      });
      if (logError) console.error('[call-center-voicemail] Failed to log message:', logError);
    }

    // Build TwiML response - ALWAYS use pre-generated audio
    // 2s pause to wait for voicemail beep, then play audio, then 3s pause, then hangup
    let twiml: string;

    if (audioUrl) {
      console.log('[call-center-voicemail] Using pre-generated audio:', audioUrl);
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="2"/>
  <Play>${escapeXml(audioUrl)}</Play>
  <Pause length="3"/>
  <Hangup/>
</Response>`;
    } else {
      // EMERGENCY FALLBACK ONLY - should never happen if audio is seeded
      console.error('[call-center-voicemail] CRITICAL: Pre-generated audio not found! Using Polly.Matthew fallback.');
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="2"/>
  <Say voice="Polly.Matthew">${escapeXml(voicemailScript)}</Say>
  <Pause length="3"/>
  <Hangup/>
</Response>`;
    }

    console.log('[call-center-voicemail] Returning TwiML with pre-generated audio');

    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('[call-center-voicemail] Handler error:', error);
    
    // Emergency fallback - use Polly.Matthew (male) ONLY
    const fallbackScript = "Hey there, this is Cash Ridez Connect LLC. Please text us back with the word CASH for the next steps. We look forward to your text, thank you.";
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="2"/>
  <Say voice="Polly.Matthew">${escapeXml(fallbackScript)}</Say>
  <Pause length="3"/>
  <Hangup/>
</Response>`;

    return new Response(fallbackTwiml, {
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
