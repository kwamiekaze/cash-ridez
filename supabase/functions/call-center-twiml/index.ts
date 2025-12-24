import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY')!;
const ELEVENLABS_AGENT_ID = Deno.env.get('ELEVENLABS_AGENT_ID')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const callLogId = url.searchParams.get('callLogId') || '';
    const firstName = url.searchParams.get('firstName') || 'there';
    const isVoicemail = url.searchParams.get('voicemail') === 'true';

    console.log(`Generating TwiML for callLogId=${callLogId}, firstName=${firstName}, voicemail=${isVoicemail}`);

    if (isVoicemail) {
      // Voicemail script
      const voicemailTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Say voice="Polly.Matthew">
    Hey ${firstName}, this is Cash Ridez Connect LLC.
    We're following up on your application from Indeed.
    Please text us the word CASH to this number for the next steps.
    We look forward to connecting with you.
  </Say>
  <Pause length="1"/>
  <Hangup/>
</Response>`;

      return new Response(voicemailTwiml, {
        headers: { ...corsHeaders, 'Content-Type': 'application/xml' },
      });
    }

    // For answered calls, connect to ElevenLabs Conversational AI
    // First, get a signed URL from ElevenLabs for the agent
    const signedUrlResponse = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_AGENT_ID}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
      }
    );

    if (!signedUrlResponse.ok) {
      console.error('Failed to get ElevenLabs signed URL:', await signedUrlResponse.text());
      // Fallback to basic TwiML
      const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">
    Hey ${firstName}, this is Cash Ridez Connect LLC.
    We're following up on your application from Indeed.
    I can answer any questions you have right now.
    When you're ready for the next steps, please text us the word CASH to this same number, and a team member will take over.
  </Say>
  <Pause length="3"/>
  <Say voice="Polly.Matthew">
    Thank you for your time. Remember to text CASH to this number to continue.
  </Say>
  <Hangup/>
</Response>`;
      return new Response(fallbackTwiml, {
        headers: { ...corsHeaders, 'Content-Type': 'application/xml' },
      });
    }

    const { signed_url } = await signedUrlResponse.json();

    // TwiML that connects to ElevenLabs via WebSocket Stream
    // The AI agent waits for human greeting first (configured in ElevenLabs dashboard)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${signed_url}">
      <Parameter name="firstName" value="${firstName}"/>
      <Parameter name="callLogId" value="${callLogId}"/>
    </Stream>
  </Connect>
</Response>`;

    console.log('Generated TwiML with ElevenLabs stream connection');

    return new Response(twiml, {
      headers: { ...corsHeaders, 'Content-Type': 'application/xml' },
    });

  } catch (error) {
    console.error('TwiML generation error:', error);
    
    // Emergency fallback
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">
    We apologize, but we're experiencing technical difficulties. Please text CASH to this number to continue.
  </Say>
  <Hangup/>
</Response>`;

    return new Response(errorTwiml, {
      headers: { ...corsHeaders, 'Content-Type': 'application/xml' },
    });
  }
});
