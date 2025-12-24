import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Inbound Voicemail Handler - Called when inbound call goes to voicemail (missed).
 * Uses the EXACT SAME ElevenLabs agent voice as outbound calls.
 * 
 * INBOUND VOICEMAIL SCRIPT (exact):
 * "Thank you for calling Cash Ridez Connect LLC, sorry we missed your call. 
 *  To connect with an agent please text the word AGENT to this number and an agent 
 *  will return your call shortly. Please save this number for future connections."
 * 
 * Then 3-second pause, then hangup.
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
    let fromNumber = '';
    
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      callSid = formData.get('CallSid') as string || '';
      fromNumber = formData.get('From') as string || '';
    }
    
    const url = new URL(req.url);
    callSid = callSid || url.searchParams.get('callSid') || '';
    fromNumber = fromNumber || url.searchParams.get('from') || '';

    console.log(`Inbound voicemail handler: CallSid=${callSid}, From=${fromNumber}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Update call log to indicate missed/voicemail
    if (callSid) {
      try {
        await supabase
          .from('admin_call_logs')
          .update({ 
            status: 'voicemail',
            voicemail_left: true,
          })
          .eq('twilio_call_sid', callSid);
      } catch (dbErr) {
        console.error('DB update failed:', dbErr);
      }
    }

    // Notify admins about missed call / voicemail
    await notifyAdminsOfMissedCall(supabase, fromNumber, callSid);

    // The EXACT script for inbound voicemail - same male ElevenLabs voice
    const voicemailScript = "Thank you for calling Cash Ridez Connect LLC, sorry we missed your call. To connect with an agent please text the word AGENT to this number and an agent will return your call shortly. Please save this number for future connections.";

    console.log('Inbound voicemail script:', voicemailScript);

    // Use ONLY the configured ElevenLabs Agent voice - SAME as outbound calls
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    const ELEVENLABS_AGENT_ID = Deno.env.get('ELEVENLABS_AGENT_ID');
    let useElevenLabs = false;
    let audioUrl = '';

    if (ELEVENLABS_API_KEY && ELEVENLABS_AGENT_ID) {
      try {
        console.log('Generating ElevenLabs audio for inbound voicemail with Agent Voice ID:', ELEVENLABS_AGENT_ID);
        
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
          const audioFileName = `call-audio/inbound-voicemail-${callSid}-${Date.now()}.mp3`;
          
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
              console.log('SUCCESS: ElevenLabs inbound voicemail audio generated:', audioUrl);
            }
          } else {
            console.error('Failed to upload inbound voicemail audio:', uploadError);
          }
        } else {
          const errorText = await response.text();
          console.error('ElevenLabs API error for inbound voicemail:', response.status, errorText);
        }
      } catch (elevenErr) {
        console.error('ElevenLabs inbound voicemail generation error:', elevenErr);
      }
    } else {
      console.error('MISSING CONFIG: ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID not set for inbound voicemail');
    }

    // Log the voicemail message
    if (callSid) {
      const { error: logError } = await supabase.from('call_center_messages').insert({
        twilio_call_sid: callSid,
        role: 'assistant',
        content: voicemailScript,
        provider: useElevenLabs ? 'elevenlabs' : 'twilio-fallback',
      });
      if (logError) console.error('Failed to log inbound voicemail message:', logError);
    }

    // Build TwiML response
    // CRITICAL: Only use ElevenLabs audio. Fallback to Polly.Matthew (male) ONLY if ElevenLabs fails.
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
      // FALLBACK ONLY: Use Polly.Matthew (male) - NEVER female
      console.error('INBOUND VOICEMAIL FALLBACK TRIGGERED: ElevenLabs unavailable, using Twilio Polly.Matthew as emergency fallback');
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">${escapeXml(voicemailScript)}</Say>
  <Pause length="3"/>
  <Hangup/>
</Response>`;
    }

    console.log('Returning inbound voicemail TwiML with ElevenLabs audio');

    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('Inbound voicemail handler error:', error);
    
    // Emergency fallback - use Polly.Matthew (male)
    console.error('INBOUND VOICEMAIL EMERGENCY FALLBACK: Critical error occurred');
    const fallbackScript = "Thank you for calling Cash Ridez Connect LLC, sorry we missed your call. To connect with an agent please text the word AGENT to this number and an agent will return your call shortly. Please save this number for future connections.";
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

async function notifyAdminsOfMissedCall(supabase: any, fromNumber: string, callSid: string) {
  try {
    // Find all admins who have missed call or voicemail notifications enabled
    const { data: adminSettings } = await supabase
      .from('admin_notification_settings')
      .select('admin_id, notify_call_missed, notify_call_voicemail');

    if (!adminSettings || adminSettings.length === 0) {
      console.log('No admin notification settings found');
      return;
    }

    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      dateStyle: 'short',
      timeStyle: 'short'
    });

    for (const setting of adminSettings) {
      // Notify for missed call
      if (setting.notify_call_missed) {
        await supabase.from('notifications').insert({
          user_id: setting.admin_id,
          type: 'call_missed',
          title: 'Missed Call',
          message: `Missed call from ${fromNumber} at ${timestamp}`,
          link: '/admin/call-center?tab=history',
          read: false,
        });
      }

      // Notify for voicemail
      if (setting.notify_call_voicemail) {
        await supabase.from('notifications').insert({
          user_id: setting.admin_id,
          type: 'call_voicemail',
          title: 'New Voicemail',
          message: `Voicemail from ${fromNumber} at ${timestamp}`,
          link: '/admin/call-center?tab=history',
          read: false,
        });
      }
    }

    console.log(`Notified admins of missed call/voicemail from ${fromNumber}`);
  } catch (err) {
    console.error('Failed to notify admins of missed call:', err);
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
