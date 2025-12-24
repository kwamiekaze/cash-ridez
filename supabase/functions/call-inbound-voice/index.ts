import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Inbound Voice Handler - Called when someone calls our Twilio number.
 * 
 * CRITICAL: Returns valid TwiML immediately. No AI calls block this response.
 * 
 * For MVP: Ring for 20 seconds, then go to voicemail with ElevenLabs voice.
 * In future: Add admin answer functionality.
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

    console.log(`Inbound call received: CallSid=${callSid}, From=${from}, To=${to}, Status=${callStatus}`);

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
      console.error('Failed to create inbound call log:', logError);
    } else {
      console.log(`Created inbound call log: ${callLog?.id}`);
    }

    // Notify admins about inbound call (non-blocking)
    notifyAdminsOfInboundCall(supabase, from, callSid).catch(err => {
      console.error('Failed to notify admins:', err);
    });

    // For MVP: Go to voicemail with ElevenLabs voice after 20 second ring
    const voicemailUrl = `${APP_BASE_URL}/functions/v1/call-inbound-voicemail?callSid=${encodeURIComponent(callSid)}&from=${encodeURIComponent(from)}`;

    // Ring for 20 seconds (simulate admin answer time), then go to voicemail
    // Use <Pause> to let it ring, then redirect to voicemail
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="20"/>
  <Redirect method="POST">${escapeXml(voicemailUrl)}</Redirect>
</Response>`;

    console.log('Returning inbound TwiML with ring and voicemail redirect');

    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('Inbound voice handler error:', error);
    
    // Emergency fallback - still try to play voicemail with male voice
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

async function notifyAdminsOfInboundCall(supabase: any, fromNumber: string, callSid: string) {
  try {
    // Find all admins who have inbound call notifications enabled
    const { data: adminSettings } = await supabase
      .from('admin_notification_settings')
      .select('admin_id')
      .eq('notify_call_inbound', true);

    if (!adminSettings || adminSettings.length === 0) {
      console.log('No admins have inbound call notifications enabled');
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

    console.log(`Notified ${adminSettings.length} admins of inbound call`);
  } catch (err) {
    console.error('Failed to notify admins of inbound call:', err);
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
