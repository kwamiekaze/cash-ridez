import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * AI/Voice Handler - Called AFTER initial TwiML response.
 * 
 * Uses the EXACT ElevenLabs agent voice configured via ELEVENLABS_AGENT_ID.
 * NO other voices should ever play. If ElevenLabs fails, log error but still
 * use Polly.Matthew as absolute last resort (never female voice).
 * 
 * OUTBOUND SCRIPT (exact):
 * "Hey {first_name}, this is Cash Ridez Connect LLC. We responded on Indeed as well. 
 *  Please text us back with the word CASH for the next steps. We look forward to your text, thank you."
 * 
 * Then 3-second pause, then hangup. NO "goodbye". NO Q&A.
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

    console.log(`AI handler: CallSid=${callSid}, FirstName=${firstName}, Inbound=${isInbound}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Build the EXACT script - starts with "Hey", ends with "thank you", NO "goodbye"
    const greeting = firstName && firstName.trim() ? `Hey ${firstName.trim()}` : 'Hey there';
    
    let scriptText: string;
    
    if (isInbound) {
      // Inbound call - different message but same voice
      scriptText = `${greeting}, thank you for calling Cash Ridez Connect LLC. For faster service, please text the word CASH to this number and a team member will assist you shortly. We look forward to your text, thank you.`;
    } else {
      // OUTBOUND: The EXACT script requested
      scriptText = `${greeting}, this is Cash Ridez Connect LLC. We responded on Indeed as well. Please text us back with the word CASH for the next steps. We look forward to your text, thank you.`;
    }

    // Log the assistant message
    if (callSid) {
      const { error: logError } = await supabase.from('call_center_messages').insert({
        twilio_call_sid: callSid,
        role: 'assistant',
        content: scriptText,
        provider: 'elevenlabs',
      });
      if (logError) console.error('Failed to log message:', logError);
    }

    // Use ONLY the configured ElevenLabs Agent voice - NO substitutes
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    const ELEVENLABS_AGENT_ID = Deno.env.get('ELEVENLABS_AGENT_ID');
    let useElevenLabs = false;
    let audioUrl = '';

    if (ELEVENLABS_API_KEY && ELEVENLABS_AGENT_ID) {
      try {
        console.log('Generating ElevenLabs audio with Agent Voice ID:', ELEVENLABS_AGENT_ID);
        console.log('Script text:', scriptText);
        
        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_AGENT_ID}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': ELEVENLABS_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: scriptText,
              model_id: 'eleven_turbo_v2_5',
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                speed: 1.0,
              },
            }),
          }
        );

        if (response.ok) {
          const audioBuffer = await response.arrayBuffer();
          
          // Store the audio in Supabase storage for Twilio to access
          const audioFileName = `call-audio/${callSid}-${Date.now()}.mp3`;
          
          const { error: uploadError } = await supabase.storage
            .from('call-recordings')
            .upload(audioFileName, new Uint8Array(audioBuffer), {
              contentType: 'audio/mpeg',
              upsert: true,
            });
          
          if (!uploadError) {
            const { data: publicUrlData } = supabase.storage
              .from('call-recordings')
              .getPublicUrl(audioFileName);
            
            if (publicUrlData?.publicUrl) {
              audioUrl = publicUrlData.publicUrl;
              useElevenLabs = true;
              console.log('SUCCESS: ElevenLabs audio generated with AGENT voice:', audioUrl);
            }
          } else {
            console.error('Failed to upload audio:', uploadError);
          }
        } else {
          const errorText = await response.text();
          console.error('ElevenLabs API error:', response.status, errorText);
        }
      } catch (elevenErr) {
        console.error('ElevenLabs generation error:', elevenErr);
      }
    } else {
      console.error('MISSING CONFIG: ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID not set');
    }

    // Build TwiML response
    // CRITICAL: Only use ElevenLabs audio. Fallback to Polly.Matthew (male) ONLY if ElevenLabs completely fails.
    // NEVER use any female voice.
    let twiml: string;

    if (useElevenLabs && audioUrl) {
      // SUCCESS: Use ONLY the ElevenLabs agent audio + 3 second pause before hangup
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${escapeXml(audioUrl)}</Play>
  <Pause length="3"/>
  <Hangup/>
</Response>`;
    } else {
      // FALLBACK ONLY: This should be rare - log it for debugging
      // Use Polly.Matthew (male voice) as emergency fallback - NEVER female
      console.error('FALLBACK TRIGGERED: ElevenLabs unavailable, using Twilio Polly.Matthew as emergency fallback');
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">${escapeXml(scriptText)}</Say>
  <Pause length="3"/>
  <Hangup/>
</Response>`;
    }

    console.log('Returning AI TwiML');

    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('AI handler CRITICAL error:', error);
    
    // Emergency fallback TwiML - only if everything fails
    // Use Polly.Matthew (male) - NEVER any female voice
    console.error('EMERGENCY FALLBACK: Returning minimal TwiML due to critical error');
    const fallbackScript = "Hey there, this is Cash Ridez Connect LLC. Please text us back with the word CASH for the next steps. We look forward to your text, thank you.";
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
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
