import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Inbound Voice Handler - Called when someone calls our Twilio number.
 * 
 * CRITICAL: NO <Say> elements. NO AI voice. NO Polly.
 * Ring for 20 seconds, then redirect to voicemail which plays the MP3.
 * 
 * On ANY error: redirect to voicemail - NEVER substitute a voice.
 */

const APP_BASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';

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
    // Parse incoming Twilio request
    const formData = await req.formData();
    const callSid = formData.get('CallSid') as string || '';
    const from = formData.get('From') as string || '';
    const to = formData.get('To') as string || '';
    const callStatus = formData.get('CallStatus') as string || '';

    console.log(`[call-inbound-voice] Inbound call: CallSid=${callSid}, From=${from}, To=${to}, Status=${callStatus}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Create inbound call log entry
    const { data: callLog, error: logError } = await supabase
      .from('admin_call_logs')
      .insert({
        admin_user_id: '00000000-0000-0000-0000-000000000000', // System user for inbound
        phone_e164: from,
        status: 'ringing',
        call_type: 'inbound',
        direction: 'inbound',
        twilio_call_sid: callSid,
      })
      .select()
      .single();

    if (logError) {
      console.error('[call-inbound-voice] Failed to create inbound call log:', logError);
    } else {
      console.log(`[call-inbound-voice] Created inbound call log: ${callLog?.id}`);
    }

    // Notify admins about inbound call (non-blocking)
    notifyAdminsOfInboundCall(supabase, from, callSid).catch(err => {
      console.error('[call-inbound-voice] Failed to notify admins:', err);
    });

    // Ring for 20 seconds, then redirect to voicemail
    const voicemailUrl = `${APP_BASE_URL}/functions/v1/call-inbound-voicemail?callSid=${encodeURIComponent(callSid)}&from=${encodeURIComponent(from)}`;

    // NO <Say> - just pause (ring) then redirect to voicemail
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="20"/>
  <Redirect method="POST">${escapeXml(voicemailUrl)}</Redirect>
</Response>`;

    console.log(`[call-inbound-voice] Returning TwiML (first 200 chars): ${twiml.slice(0, 200)}`);

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });

  } catch (error) {
    console.error('[call-inbound-voice] Inbound voice handler error:', error);

    // On error: redirect to voicemail (no voice fallback)
    const voicemailUrl = `${APP_BASE_URL}/functions/v1/call-inbound-voicemail`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${escapeXml(voicemailUrl)}</Redirect>
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

async function notifyAdminsOfInboundCall(supabase: any, fromNumber: string, callSid: string) {
  try {
    // Find all admins who have inbound call notifications enabled
    const { data: adminSettings } = await supabase
      .from('admin_notification_settings')
      .select('admin_id')
      .eq('notify_call_inbound', true);

    if (!adminSettings || adminSettings.length === 0) {
      console.log('[call-inbound-voice] No admins have inbound call notifications enabled');
      return;
    }

    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      dateStyle: 'short',
      timeStyle: 'short'
    });

    // Create notifications for each admin
    for (const setting of adminSettings) {
      await supabase.from('notifications').insert({
        user_id: setting.admin_id,
        type: 'call_inbound',
        title: 'Incoming Call',
        message: `Incoming call from ${fromNumber} at ${timestamp}`,
        link: '/admin/call-center?tab=history',
        read: false,
      });
    }

    console.log(`[call-inbound-voice] Notified ${adminSettings.length} admins of inbound call`);
  } catch (err) {
    console.error('[call-inbound-voice] Failed to notify admins of inbound call:', err);
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
