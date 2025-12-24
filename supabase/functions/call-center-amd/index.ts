import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Answering Machine Detection (AMD) Handler
 * 
 * Called by Twilio when AMD completes after a call connects.
 * 
 * CRITICAL: Uses ONLY the pre-recorded voicemail MP3 from GitHub.
 * NO ElevenLabs, NO Twilio <Say>, NO Polly, NO AI voice generation.
 * 
 * AUTHORITATIVE VOICEMAIL URL (for leaving messages on voicemail):
 * https://github.com/kwamiekaze/cashridez-voicemail/raw/refs/heads/main/cashridez_voicemail.mp3
 * 
 * HUMAN ANSWERED FLOW:
 * - The initial TwiML (call-center-twiml) already uses <Gather> to listen
 * - When gather completes, it plays the outbound MP3
 * - This handler just logs and updates status
 * 
 * VOICEMAIL FLOW:
 * - Redirect to call-center-voicemail to play the voicemail MP3
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_BASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;

// Voicemail MP3 for leaving messages
const VOICEMAIL_MP3_URL = "https://github.com/kwamiekaze/cashridez-voicemail/raw/refs/heads/main/cashridez_voicemail.mp3";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const formData = await req.formData();
    const callSid = formData.get('CallSid') as string;
    const answeredBy = formData.get('AnsweredBy') as string;
    const machineDetectionDuration = formData.get('MachineDetectionDuration') as string;

    console.log(`[call-center-amd] AMD result for ${callSid}: ${answeredBy} (duration: ${machineDetectionDuration}ms)`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Log AMD result
    await supabase.from('call_center_messages').insert({
      twilio_call_sid: callSid,
      role: 'system',
      content: `[AMD Result] AnsweredBy: ${answeredBy}, Duration: ${machineDetectionDuration}ms`,
      provider: 'twilio-amd',
      metadata: {
        answered_by: answeredBy,
        detection_duration_ms: machineDetectionDuration,
        timestamp: new Date().toISOString(),
      },
    });

    // Get the call log to find firstName
    const { data: callLog } = await supabase
      .from('admin_call_logs')
      .select('id, first_name, campaign_recipient_id')
      .eq('twilio_call_sid', callSid)
      .single();

    const firstName = callLog?.first_name || 'there';

    // Handle different answering scenarios
    if (answeredBy === 'machine_end_beep' || answeredBy === 'machine_end_silence' || answeredBy === 'machine_end_other') {
      // Voicemail detected - redirect call to play voicemail MP3
      console.log(`[call-center-amd] Voicemail detected for ${callSid}, redirecting to voicemail`);

      // Redirect to voicemail handler which plays the voicemail MP3
      const redirectUrl = `${APP_BASE_URL}/functions/v1/call-center-voicemail?callSid=${callSid}&firstName=${encodeURIComponent(firstName)}`;

      const redirectResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            Url: redirectUrl,
            Method: 'POST',
          }),
        }
      );

      console.log(`[call-center-amd] Redirect response: ${redirectResponse.status}`);

      // Update call log and recipient to indicate voicemail
      if (callLog) {
        await supabase
          .from('admin_call_logs')
          .update({
            status: 'voicemail',
            voicemail_left: true,
          })
          .eq('id', callLog.id);

        if (callLog.campaign_recipient_id) {
          await supabase
            .from('admin_call_campaign_recipients')
            .update({
              status: 'voicemail',
              voicemail_left: true,
            })
            .eq('id', callLog.campaign_recipient_id);
        }
      }

    } else if (answeredBy === 'human') {
      // Human answered - the gather flow is already in progress from call-center-twiml
      // Just update status and log
      console.log(`[call-center-amd] Human answered ${callSid}, gather flow in progress`);

      if (callLog) {
        await supabase
          .from('admin_call_logs')
          .update({
            status: 'answered',
            call_answered_at: new Date().toISOString(),
          })
          .eq('id', callLog.id);

        if (callLog.campaign_recipient_id) {
          await supabase
            .from('admin_call_campaign_recipients')
            .update({
              status: 'answered',
            })
            .eq('id', callLog.campaign_recipient_id);
        }
      }

    } else if (answeredBy === 'fax') {
      // Fax machine - hang up immediately
      console.log(`[call-center-amd] Fax detected for ${callSid}, hanging up`);

      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            Status: 'completed',
          }),
        }
      );

      if (callLog) {
        await supabase
          .from('admin_call_logs')
          .update({
            status: 'failed',
            error_message: 'Fax machine detected',
          })
          .eq('id', callLog.id);
      }
    }

    console.log(`[call-center-amd] Completed in ${Date.now() - startTime}ms`);

    return new Response('OK', {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });

  } catch (error) {
    console.error('[call-center-amd] AMD webhook error:', error);
    return new Response('Error', {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });
  }
});
