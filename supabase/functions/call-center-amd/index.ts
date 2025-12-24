import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_BASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const callSid = formData.get('CallSid') as string;
    const answeredBy = formData.get('AnsweredBy') as string;
    const machineDetectionDuration = formData.get('MachineDetectionDuration') as string;

    console.log(`AMD result for ${callSid}: ${answeredBy} (duration: ${machineDetectionDuration}ms)`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get the call log to find firstName
    const { data: callLog } = await supabase
      .from('admin_call_logs')
      .select('id, first_name, campaign_recipient_id')
      .eq('twilio_call_sid', callSid)
      .single();

    const firstName = callLog?.first_name || 'there';

    // Handle different answering scenarios
    if (answeredBy === 'machine_end_beep' || answeredBy === 'machine_end_silence' || answeredBy === 'machine_end_other') {
      // Voicemail detected - redirect call to leave voicemail
      console.log(`Voicemail detected for ${callSid}, redirecting to leave message`);

      // Update call to play voicemail TwiML
      const redirectUrl = `${APP_BASE_URL}/functions/v1/call-center-voicemail?callSid=${callSid}&firstName=${encodeURIComponent(firstName)}`;

      await fetch(
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
      // Human answered - continue with AI agent (already configured in initial TwiML)
      console.log(`Human answered ${callSid}, AI agent will engage`);

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
      // Fax machine - hang up
      console.log(`Fax detected for ${callSid}, hanging up`);

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

    return new Response('OK', {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });

  } catch (error) {
    console.error('AMD webhook error:', error);
    return new Response('Error', {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });
  }
});
