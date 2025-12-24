import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Inbound Voicemail Handler - Called when inbound call is missed.
 * 
 * CRITICAL: Uses PRE-GENERATED audio stored in call_center_audio bucket.
 * This ensures the EXACT SAME male ElevenLabs voice plays every time with zero latency.
 * 
 * INBOUND VOICEMAIL SCRIPT:
 * "Thank you for calling Cash Ridez Connect LLC, sorry we missed your call. 
 *  To connect with an agent please text the word AGENT to this number and an agent 
 *  will return your call shortly. Please save this number for future connections."
 * 
 * Then 3-second pause, then hangup.
 */

const APP_BASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';

// Pre-generated audio URL (seeded via call-center-seed-audio function)
const VOICEMAIL_AUDIO_PATH = 'inbound_voicemail.mp3';

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

    console.log(`[call-inbound-voicemail] CallSid=${callSid}, From=${fromNumber}`);

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
        console.error('[call-inbound-voicemail] DB update failed:', dbErr);
      }
    }

    // Notify admins about missed call / voicemail (non-blocking)
    notifyAdminsOfMissedCall(supabase, fromNumber, callSid).catch(err => {
      console.error('[call-inbound-voicemail] Failed to notify admins:', err);
    });

    // Get the pre-generated audio URL from the public bucket
    const { data: publicUrlData } = supabase.storage
      .from('call_center_audio')
      .getPublicUrl(VOICEMAIL_AUDIO_PATH);

    const audioUrl = publicUrlData?.publicUrl;

    // Log the voicemail message
    const voicemailScript = 'Thank you for calling Cash Ridez Connect LLC, sorry we missed your call. To connect with an agent please text the word AGENT to this number and an agent will return your call shortly. Please save this number for future connections.';
    if (callSid) {
      const { error: logError } = await supabase.from('call_center_messages').insert({
        twilio_call_sid: callSid,
        role: 'assistant',
        content: voicemailScript,
        provider: 'elevenlabs-pregenerated',
      });
      if (logError) console.error('[call-inbound-voicemail] Failed to log message:', logError);
    }

    // Build TwiML response - ALWAYS use pre-generated audio
    let twiml: string;

    if (audioUrl) {
      console.log('[call-inbound-voicemail] Using pre-generated audio:', audioUrl);
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${escapeXml(audioUrl)}</Play>
  <Pause length="3"/>
  <Hangup/>
</Response>`;
    } else {
      // EMERGENCY FALLBACK ONLY - should never happen if audio is seeded
      console.error('[call-inbound-voicemail] CRITICAL: Pre-generated audio not found! Using Polly.Matthew fallback.');
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">${escapeXml(voicemailScript)}</Say>
  <Pause length="3"/>
  <Hangup/>
</Response>`;
    }

    console.log('[call-inbound-voicemail] Returning TwiML with pre-generated audio');

    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('[call-inbound-voicemail] Handler error:', error);
    
    // Emergency fallback - use Polly.Matthew (male) ONLY
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
      console.log('[call-inbound-voicemail] No admin notification settings found');
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

    console.log(`[call-inbound-voicemail] Notified admins of missed call/voicemail from ${fromNumber}`);
  } catch (err) {
    console.error('[call-inbound-voicemail] Failed to notify admins of missed call:', err);
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
