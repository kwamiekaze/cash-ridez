import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * AI/Voice Handler - Called AFTER initial TwiML response.
 * This endpoint speaks the short script using ElevenLabs male voice,
 * then immediately ends the call. NO Q&A, NO conversation loop.
 * 
 * Script: "Hey {first_name}, this is Cash Ridez Connect LLC. We responded on Indeed as well, please reply CASH for the next steps."
 * Then: "Goodbye." and hang up.
 */

const ELEVENLABS_VOICE_ID = 'TX3LPaxmHKxFdv7VOQHJ'; // Liam - male voice

serve(async (req) => {
  const APP_BASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';

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

    // Build the exact script - short and direct
    const greeting = firstName && firstName.trim() ? `Hey ${firstName.trim()}` : 'Hey there';
    
    let mainScript: string;
    let goodbyeScript: string;
    
    if (isInbound) {
      // Inbound call - different message
      mainScript = `${greeting}, thank you for calling Cash Ridez Connect LLC. For faster service, please text the word CASH to this number and a team member will assist you shortly.`;
      goodbyeScript = "Goodbye.";
    } else {
      // Outbound call - the exact script requested
      mainScript = `${greeting}, this is Cash Ridez Connect LLC. We responded on Indeed as well, please reply CASH for the next steps.`;
      goodbyeScript = "Goodbye.";
    }

    // Log the assistant message
    if (callSid) {
      const { error: logError } = await supabase.from('call_center_messages').insert({
        twilio_call_sid: callSid,
        role: 'assistant',
        content: mainScript + " " + goodbyeScript,
        provider: 'script',
      });
      if (logError) console.error('Failed to log message:', logError);
    }

    // Try to generate ElevenLabs audio
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    let useElevenLabs = false;
    let audioUrl = '';

    if (ELEVENLABS_API_KEY) {
      try {
        const fullText = mainScript + " " + goodbyeScript;
        
        console.log('Generating ElevenLabs audio for:', fullText);
        
        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': ELEVENLABS_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: fullText,
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
          // Convert to base64 and create data URI (Twilio supports this)
          const audioBuffer = await response.arrayBuffer();
          const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));
          
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
              console.log('ElevenLabs audio URL:', audioUrl);
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
    }

    // Build TwiML response
    let twiml: string;

    if (useElevenLabs && audioUrl) {
      // Use the ElevenLabs audio
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${escapeXml(audioUrl)}</Play>
  <Hangup/>
</Response>`;
    } else {
      // Fallback to Twilio voice (male voice - Polly.Matthew)
      console.log('FALLBACK: Using Twilio Polly.Matthew voice (ElevenLabs unavailable)');
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">${escapeXml(mainScript)}</Say>
  <Pause length="1"/>
  <Say voice="Polly.Matthew">${escapeXml(goodbyeScript)}</Say>
  <Hangup/>
</Response>`;
    }

    console.log('Returning AI TwiML');

    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('AI handler error:', error);
    
    // Fallback TwiML - still use male voice
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">This is Cash Ridez Connect. Please text CASH to this number for next steps. Goodbye.</Say>
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
