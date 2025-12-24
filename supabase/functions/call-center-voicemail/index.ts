import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Voicemail Handler - Called when AMD detects answering machine.
 * Uses the EXACT SAME ElevenLabs agent voice as answered calls.
 * 
 * OUTBOUND VOICEMAIL SCRIPT (exact - same as answered):
 * "Hey {first_name}, this is Cash Ridez Connect LLC. We responded on Indeed as well. 
 *  Please text us back with the word CASH for the next steps. We look forward to your text, thank you."
 * 
 * Then 3-second pause, then hangup. NO "goodbye".
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

    console.log(`Voicemail handler: CallSid=${callSid}, FirstName=${firstName}`);

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
        console.error('DB update failed:', dbErr);
      }
    }

    // Build the EXACT script - SAME as answered calls, starts with Hey, ends with thank you
    const greeting = firstName && firstName.trim() ? `Hey ${firstName.trim()}` : 'Hey there';
    const voicemailScript = `${greeting}, this is Cash Ridez Connect LLC. We responded on Indeed as well. Please text us back with the word CASH for the next steps. We look forward to your text, thank you.`;

    console.log('Voicemail script:', voicemailScript);

    // Use ONLY the configured ElevenLabs Agent voice - SAME as call-center-ai
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    const ELEVENLABS_AGENT_ID = Deno.env.get('ELEVENLABS_AGENT_ID');
    let useElevenLabs = false;
    let audioUrl = '';

    if (ELEVENLABS_API_KEY && ELEVENLABS_AGENT_ID) {
      try {
        console.log('Generating ElevenLabs audio for voicemail with Agent Voice ID:', ELEVENLABS_AGENT_ID);
        
        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_AGENT_ID}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': ELEVENLABS_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: voicemailScript,
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
          const audioFileName = `call-audio/voicemail-${callSid}-${Date.now()}.mp3`;
          
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
              console.log('SUCCESS: ElevenLabs voicemail audio generated:', audioUrl);
            }
          } else {
            console.error('Failed to upload voicemail audio:', uploadError);
          }
        } else {
          const errorText = await response.text();
          console.error('ElevenLabs API error for voicemail:', response.status, errorText);
        }
      } catch (elevenErr) {
        console.error('ElevenLabs voicemail generation error:', elevenErr);
      }
    } else {
      console.error('MISSING CONFIG: ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID not set for voicemail');
    }

    // Log the voicemail message
    if (callSid) {
      const { error: logError } = await supabase.from('call_center_messages').insert({
        twilio_call_sid: callSid,
        role: 'assistant',
        content: voicemailScript,
        provider: useElevenLabs ? 'elevenlabs' : 'twilio-fallback',
      });
      if (logError) console.error('Failed to log voicemail message:', logError);
    }

    // Build TwiML response
    // CRITICAL: Only use ElevenLabs audio. Fallback to Polly.Matthew (male) ONLY if ElevenLabs fails.
    let twiml: string;

    if (useElevenLabs && audioUrl) {
      // SUCCESS: Use ONLY the ElevenLabs agent audio
      // Add 2s pause before playing (wait for voicemail beep to finish)
      // Then 3 second pause after script, then hangup
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="2"/>
  <Play>${escapeXml(audioUrl)}</Play>
  <Pause length="3"/>
  <Hangup/>
</Response>`;
    } else {
      // FALLBACK ONLY: Use Polly.Matthew (male) - NEVER female
      console.error('VOICEMAIL FALLBACK TRIGGERED: ElevenLabs unavailable, using Twilio Polly.Matthew as emergency fallback');
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="2"/>
  <Say voice="Polly.Matthew">${escapeXml(voicemailScript)}</Say>
  <Pause length="3"/>
  <Hangup/>
</Response>`;
    }

    console.log('Returning voicemail TwiML with ElevenLabs audio');

    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('Voicemail handler error:', error);
    
    // Emergency fallback - log this case, use Polly.Matthew (male)
    console.error('VOICEMAIL EMERGENCY FALLBACK: Critical error occurred');
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
