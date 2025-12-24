import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Campaign Tick Handler - Processes one recipient at a time
 * Called periodically by cron or manually to advance campaigns
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const APP_BASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';
  const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!;
  const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
  const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')!;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Find running campaigns
    const { data: campaigns } = await supabase
      .from('admin_call_campaigns')
      .select('*')
      .eq('status', 'running');

    if (!campaigns || campaigns.length === 0) {
      return new Response(JSON.stringify({ message: 'No running campaigns' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let callsPlaced = 0;

    for (const campaign of campaigns) {
      // Check if we can place a call (respect spacing)
      if (campaign.last_call_at) {
        const lastCall = new Date(campaign.last_call_at);
        const spacing = (campaign.call_spacing_seconds || 90) * 1000;
        if (Date.now() - lastCall.getTime() < spacing) {
          console.log(`Campaign ${campaign.id}: Too soon since last call`);
          continue;
        }
      }

      // Get next queued recipient
      const { data: recipient, error: recipientError } = await supabase
        .from('admin_call_campaign_recipients')
        .select('*')
        .eq('campaign_id', campaign.id)
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (recipientError || !recipient) {
        // No more recipients - mark campaign complete
        await supabase
          .from('admin_call_campaigns')
          .update({ 
            status: 'completed',
            finished_at: new Date().toISOString()
          })
          .eq('id', campaign.id);
        
        console.log(`Campaign ${campaign.id}: Completed (no more recipients)`);
        continue;
      }

      console.log(`Calling recipient ${recipient.id}: ${recipient.phone_e164}`);

      // Create call log first
      const { data: callLog, error: logError } = await supabase
        .from('admin_call_logs')
        .insert({
          admin_user_id: campaign.created_by,
          campaign_id: campaign.id,
          campaign_recipient_id: recipient.id,
          first_name: recipient.first_name,
          phone_e164: recipient.phone_e164,
          status: 'initiated',
          call_type: 'outbound',
        })
        .select()
        .single();

      if (logError) {
        console.error('Failed to create call log:', logError);
        continue;
      }

      // Place the call
      const twimlUrl = `${APP_BASE_URL}/functions/v1/call-center-twiml?callLogId=${callLog.id}&firstName=${encodeURIComponent(recipient.first_name || '')}`;
      const statusCallbackUrl = `${APP_BASE_URL}/functions/v1/call-center-status`;
      const amdCallbackUrl = `${APP_BASE_URL}/functions/v1/call-center-amd`;

      try {
        const twilioResponse = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: recipient.phone_e164,
              From: TWILIO_PHONE_NUMBER,
              Url: twimlUrl,
              StatusCallback: statusCallbackUrl,
              StatusCallbackEvent: 'initiated ringing answered completed',
              StatusCallbackMethod: 'POST',
              MachineDetection: 'DetectMessageEnd',
              AsyncAmd: 'true',
              AsyncAmdStatusCallback: amdCallbackUrl,
              AsyncAmdStatusCallbackMethod: 'POST',
              Record: 'true',
              RecordingStatusCallback: `${APP_BASE_URL}/functions/v1/call-center-recording`,
              RecordingStatusCallbackEvent: 'completed',
            }),
          }
        );

        const twilioData = await twilioResponse.json();

        if (twilioResponse.ok) {
          // Update call log and recipient with call SID
          await supabase
            .from('admin_call_logs')
            .update({ twilio_call_sid: twilioData.sid })
            .eq('id', callLog.id);

          await supabase
            .from('admin_call_campaign_recipients')
            .update({
              status: 'calling',
              twilio_call_sid: twilioData.sid,
              call_started_at: new Date().toISOString(),
              attempt_count: recipient.attempt_count + 1,
              last_attempt_at: new Date().toISOString(),
            })
            .eq('id', recipient.id);

          // Update campaign
          await supabase
            .from('admin_call_campaigns')
            .update({
              last_call_at: new Date().toISOString(),
              called_count: campaign.called_count + 1,
            })
            .eq('id', campaign.id);

          callsPlaced++;
          console.log(`Call placed successfully: ${twilioData.sid}`);
        } else {
          // Call failed
          console.error('Twilio call failed:', twilioData);
          
          await supabase
            .from('admin_call_logs')
            .update({
              status: 'failed',
              error_code: twilioData.code?.toString(),
              error_message: twilioData.message,
            })
            .eq('id', callLog.id);

          await supabase
            .from('admin_call_campaign_recipients')
            .update({
              status: 'failed',
              last_error: twilioData.message,
            })
            .eq('id', recipient.id);
        }
      } catch (callError) {
        console.error('Call placement error:', callError);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      callsPlaced,
      message: `Processed ${campaigns.length} campaigns, placed ${callsPlaced} calls`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Campaign tick error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
