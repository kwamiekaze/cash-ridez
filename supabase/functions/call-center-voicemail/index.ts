import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Voicemail Handler - Called when AMD detects answering machine (outbound calls).
 * 
 * CRITICAL: Uses ONLY the pre-recorded Cashridez_VM2.mp3 audio file.
 * NO ElevenLabs, NO Twilio <Say>, NO fallback voices.
 * 
 * The audio file is stored in the call_center_audio bucket as 'cashridez_voicemail.mp3'
 */

const VOICEMAIL_AUDIO_PATH = 'cashridez_voicemail.mp3';

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

    // Get the pre-recorded audio URL from the public bucket
    const { data: publicUrlData } = supabase.storage
      .from('call_center_audio')
      .getPublicUrl(VOICEMAIL_AUDIO_PATH);

    const audioUrl = publicUrlData?.publicUrl;

    if (!audioUrl) {
      console.error('[call-center-voicemail] CRITICAL: Voicemail audio file not found!');
      // Return a hangup - do NOT use any TTS fallback
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
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

    console.log('[call-center-voicemail] Playing pre-recorded audio:', audioUrl);
    console.log('[call-center-voicemail] voicemail_script_played=true');

    // Build TwiML response - ONLY use pre-recorded audio, NO fallbacks
    // 2s pause to wait for voicemail beep, then play audio, then 3s pause, then hangup
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="2"/>
  <Play>${escapeXml(audioUrl)}</Play>
  <Pause length="3"/>
  <Hangup/>
</Response>`;

    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('[call-center-voicemail] Handler error:', error);
    
    // On error, just hangup - NO TTS fallback
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
