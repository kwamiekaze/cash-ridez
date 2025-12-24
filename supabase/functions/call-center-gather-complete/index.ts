import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Gather Complete Handler - Called after Twilio's <Gather> completes.
 * 
 * This is hit after:
 * 1. The caller spoke and stopped speaking (SpeechResult present)
 * 2. The timeout elapsed with no speech (no SpeechResult)
 * 
 * In both cases: Play the outbound MP3, then hang up.
 * 
 * CRITICAL: Uses ONLY the pre-recorded outbound MP3 from GitHub.
 * NO ElevenLabs, NO Twilio <Say>, NO Polly, NO AI voice generation.
 */

// HARDCODED GitHub MP3 URL - DO NOT CHANGE
const OUTBOUND_MP3_URL = "https://github.com/kwamiekaze/cashridez-voicemail/raw/refs/heads/main/cashridez_outbound.mp3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let callSid = '';
  let speechResult = '';
  let speechConfidence = '';
  let gatherOutcome = 'timeout'; // 'speech_detected' or 'timeout'

  try {
    // Parse request - Twilio sends form data
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      callSid = formData.get('CallSid') as string || '';
      speechResult = formData.get('SpeechResult') as string || '';
      speechConfidence = formData.get('Confidence') as string || '';
    }

    // Also check URL params
    const url = new URL(req.url);
    callSid = callSid || url.searchParams.get('callSid') || '';

    // Determine gather outcome
    if (speechResult && speechResult.trim().length > 0) {
      gatherOutcome = 'speech_detected';
    }

    console.log(`[call-center-gather-complete] CallSid=${callSid}, Outcome=${gatherOutcome}, SpeechResult="${speechResult}", Confidence=${speechConfidence}`);

    // Log to database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Log gather event
    await supabase.from('call_center_messages').insert({
      twilio_call_sid: callSid,
      role: 'system',
      content: `[Gather complete] Outcome: ${gatherOutcome}${speechResult ? `, Speech: "${speechResult}"` : ''}`,
      provider: 'twilio-gather',
      metadata: {
        gather_outcome: gatherOutcome,
        speech_result: speechResult || null,
        speech_confidence: speechConfidence || null,
        timestamp: new Date().toISOString(),
        latency_ms: Date.now() - startTime,
      },
    }).then(({ error }) => {
      if (error) console.error('[call-center-gather-complete] Failed to log:', error);
    });

    // Update call log with gather details
    if (callSid) {
      await supabase
        .from('admin_call_logs')
        .update({
          ai_conversation_summary: `Gather: ${gatherOutcome}${speechResult ? ` - "${speechResult}"` : ''}`,
        })
        .eq('twilio_call_sid', callSid);
    }

    // Log the play start
    await supabase.from('call_center_messages').insert({
      twilio_call_sid: callSid,
      role: 'assistant',
      content: '[Playing outbound MP3: cashridez_outbound.mp3]',
      provider: 'prerecorded-github',
      metadata: {
        action: 'play_start',
        mp3_url: OUTBOUND_MP3_URL,
        timestamp: new Date().toISOString(),
      },
    });

    // Build TwiML response - Play MP3 then hang up
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${OUTBOUND_MP3_URL}</Play>
  <Pause length="1"/>
  <Hangup/>
</Response>`;

    console.log(`[call-center-gather-complete] Returning play TwiML, latency=${Date.now() - startTime}ms`);

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });

  } catch (error) {
    console.error('[call-center-gather-complete] Error:', error);
    
    // On error: Still play MP3 and hang up (no voice fallback)
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
