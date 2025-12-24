import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * AI/Conversation Handler - Called AFTER initial TwiML response.
 * This endpoint handles the actual conversation flow with AI.
 * Returns TwiML with <Gather> for speech input and <Say> for responses.
 */

const DEFAULT_SCRIPT = `Hey, this is Cash Ridez Connect LLC. We're following up on your Indeed application. 
I'm here to answer any questions you might have about the opportunity. 
When you're ready for the next steps, just text the word CASH to this number, and a team member will take over.`;

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
    let speechResult = '';
    let firstName = 'there';
    
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      callSid = formData.get('CallSid') as string || '';
      speechResult = formData.get('SpeechResult') as string || '';
    }
    
    // Also check URL params
    const url = new URL(req.url);
    callSid = callSid || url.searchParams.get('callSid') || url.searchParams.get('CallSid') || '';
    firstName = url.searchParams.get('firstName') || 'there';

    console.log(`AI handler: CallSid=${callSid}, SpeechResult="${speechResult}", FirstName=${firstName}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Log user speech if present
    if (speechResult && callSid) {
      await supabase.from('call_center_messages').insert({
        twilio_call_sid: callSid,
        role: 'user',
        content: speechResult,
        provider: 'twilio',
      });
    }

    // If user said something, try to generate an AI response
    let aiResponse = '';
    
    if (speechResult) {
      // Check for goodbye signals
      const goodbyeWords = ['bye', 'goodbye', 'thanks', 'thank you', 'no thanks', 'not interested', 'stop'];
      const isGoodbye = goodbyeWords.some(word => speechResult.toLowerCase().includes(word));
      
      if (isGoodbye) {
        aiResponse = `Thank you for your time, ${firstName}. Remember, just text CASH to this number whenever you're ready for the next steps. Have a great day!`;
        
        // Log and end call
        await supabase.from('call_center_messages').insert({
          twilio_call_sid: callSid,
          role: 'assistant',
          content: aiResponse,
          provider: 'fallback',
        });
        
        const endTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">${escapeXml(aiResponse)}</Say>
  <Hangup/>
</Response>`;
        
        return new Response(endTwiml, {
          status: 200,
          headers: { 'Content-Type': 'text/xml' },
        });
      }

      // Try to use Lovable AI for response
      try {
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        
        if (LOVABLE_API_KEY) {
          const aiStartTime = Date.now();
          
          const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                {
                  role: 'system',
                  content: `You are a friendly phone agent for Cash Ridez Connect LLC, a rideshare platform. 
You're calling to follow up on Indeed job applications.
Keep responses brief (1-2 sentences), friendly, and natural for phone conversation.
Always encourage them to text "CASH" to continue with next steps.
Don't ask too many questions - be helpful and concise.
If they ask about pay, say drivers keep 100% of their fares on the platform.
If they ask about requirements, say they need a valid license, insurance, and a reliable vehicle.`
                },
                { role: 'user', content: speechResult }
              ],
              max_tokens: 150,
            }),
          });

          if (aiResp.ok) {
            const aiData = await aiResp.json();
            aiResponse = aiData.choices?.[0]?.message?.content || '';
            
            const latency = Date.now() - aiStartTime;
            console.log(`AI response generated in ${latency}ms: "${aiResponse}"`);
            
            // Log AI response
            await supabase.from('call_center_messages').insert({
              twilio_call_sid: callSid,
              role: 'assistant',
              content: aiResponse,
              latency_ms: latency,
              provider: 'lovable-ai',
            });
          }
        }
      } catch (aiError) {
        console.error('AI generation error:', aiError);
      }
    }

    // Fallback response if AI didn't generate anything
    if (!aiResponse) {
      if (speechResult) {
        // They spoke but we couldn't process
        aiResponse = `I appreciate that. To move forward with your application, just text the word CASH to this number, and we'll get you started right away.`;
      } else {
        // No speech detected, deliver the main script
        aiResponse = DEFAULT_SCRIPT.replace('{first_name}', firstName);
      }
      
      // Log fallback
      if (callSid) {
        await supabase.from('call_center_messages').insert({
          twilio_call_sid: callSid,
          role: 'assistant',
          content: aiResponse,
          provider: 'fallback',
        });
      }
    }

    // Build TwiML with Gather for next response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">${escapeXml(aiResponse)}</Say>
  <Gather input="speech" 
          timeout="5" 
          speechTimeout="auto"
          action="${APP_BASE_URL}/functions/v1/call-center-ai?callSid=${encodeURIComponent(callSid)}&amp;firstName=${encodeURIComponent(firstName)}"
          method="POST">
    <Say voice="Polly.Matthew">Do you have any questions for me?</Say>
  </Gather>
  <Say voice="Polly.Matthew">I didn't catch that. Remember, just text CASH to this number for next steps. Take care!</Say>
  <Hangup/>
</Response>`;

    console.log('Returning AI TwiML');

    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('AI handler error:', error);
    
    // Fallback TwiML
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for your time. Please text CASH to this number for the next steps. Goodbye!</Say>
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
