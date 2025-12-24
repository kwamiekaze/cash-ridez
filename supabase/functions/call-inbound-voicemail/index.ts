import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Inbound Voicemail Handler - Called when inbound call is missed.
 * 
 * CRITICAL: Uses ONLY the pre-recorded voicemail audio via PUBLIC Supabase Storage URL.
 * NO ElevenLabs, NO Twilio <Say>, NO fallback voices.
 * 
 * The audio is served directly from Supabase Storage public bucket:
 * ${SUPABASE_URL}/storage/v1/object/public/call_center_audio/cashridez_voicemail.mp3
 * 
 * This URL is:
 * - Public (no auth required)
 * - HTTPS
 * - Returns 200 OK with audio/mpeg
 * - No redirects
 * - Stable forever
 */

// Hardcoded full public MP3 URL (no runtime concatenation)
const PUBLIC_VOICEMAIL_URL = 'https://wnajjqsqmrpwyffbpgsj.supabase.co/storage/v1/object/public/call_center_audio/cashridez_voicemail.mp3';


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
    console.log(`[call-inbound-voicemail] Using PUBLIC storage URL: ${PUBLIC_VOICEMAIL_URL}`);

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

    // Log the voicemail message
    if (callSid) {
      const { error: logError } = await supabase.from('call_center_messages').insert({
        twilio_call_sid: callSid,
        role: 'assistant',
        content: '[Played pre-recorded voicemail: cashridez_voicemail.mp3]',
        provider: 'prerecorded',
      });
      if (logError) console.error('[call-inbound-voicemail] Failed to log message:', logError);
    }

    console.log('[call-inbound-voicemail] TwiML will use <Play> URL:', PUBLIC_VOICEMAIL_URL);

    // Build TwiML response (MUST be ONLY Play + Pause + Hangup)
    const twiml = `<Response>
  <Play>https://wnajjqsqmrpwyffbpgsj.supabase.co/storage/v1/object/public/call_center_audio/cashridez_voicemail.mp3</Play>
  <Pause length="3"/>
  <Hangup/>
</Response>`;

    const responseContentType = 'text/xml; charset=utf-8';
    console.log(`[call-inbound-voicemail] Returning TwiML (first 200 chars): ${twiml.slice(0, 200)}`);
    console.log(`[call-inbound-voicemail] Response Content-Type: ${responseContentType}`);

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': responseContentType,
        'Cache-Control': 'no-store',
      },
    });

  } catch (error) {
    console.error('[call-inbound-voicemail] Handler error:', error);

    // Even on error: return the exact voicemail TwiML (no <Say> fallback)
    const twiml = `<Response>
  <Play>https://wnajjqsqmrpwyffbpgsj.supabase.co/storage/v1/object/public/call_center_audio/cashridez_voicemail.mp3</Play>
  <Pause length="3"/>
  <Hangup/>
</Response>`;

    const responseContentType = 'text/xml; charset=utf-8';
    console.log(`[call-inbound-voicemail] Returning TwiML (error path, first 200 chars): ${twiml.slice(0, 200)}`);
    console.log(`[call-inbound-voicemail] Response Content-Type (error path): ${responseContentType}`);

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': responseContentType,
        'Cache-Control': 'no-store',
      },
    });
  }
});

async function notifyAdminsOfMissedCall(supabase: any, fromNumber: string, callSid: string) {
  try {
    const { data: adminSettings } = await supabase
      .from('admin_notification_settings')
      .select('admin_id, notify_call_missed, notify_call_voicemail');

    if (!adminSettings || adminSettings.length === 0) {
      return;
    }

    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      dateStyle: 'short',
      timeStyle: 'short'
    });

    for (const setting of adminSettings) {
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
  } catch (err) {
    console.error('[call-inbound-voicemail] Failed to notify admins:', err);
  }
}

