import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * End Call endpoint - Hangs up an active call using Twilio API
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { callSid, callLogId } = await req.json();

    if (!callSid && !callLogId) {
      return new Response(
        JSON.stringify({ success: false, error: 'callSid or callLogId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      throw new Error('Twilio credentials not configured');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let twilioCallSid = callSid;

    // If we have callLogId, look up the Twilio SID
    if (!twilioCallSid && callLogId) {
      const { data: callLog } = await supabase
        .from('admin_call_logs')
        .select('twilio_call_sid')
        .eq('id', callLogId)
        .single();
      
      if (callLog?.twilio_call_sid) {
        twilioCallSid = callLog.twilio_call_sid;
      }
    }

    if (!twilioCallSid) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not find call SID' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Ending call: ${twilioCallSid}`);

    // Call Twilio API to update call status to 'completed'
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    
    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${twilioCallSid}.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'Status=completed',
      }
    );

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();
      console.error('Twilio end call error:', errorText);
      
      // If call is already ended, that's okay
      if (errorText.includes('already completed') || twilioResponse.status === 404) {
        // Update DB anyway
        await supabase
          .from('admin_call_logs')
          .update({ 
            status: 'completed',
            call_ended_at: new Date().toISOString(),
          })
          .eq('twilio_call_sid', twilioCallSid);
        
        return new Response(
          JSON.stringify({ success: true, message: 'Call already ended' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Twilio API error: ${errorText}`);
    }

    // Update our database - call log
    const { data: callLog } = await supabase
      .from('admin_call_logs')
      .update({ 
        status: 'completed',
        call_ended_at: new Date().toISOString(),
      })
      .eq('twilio_call_sid', twilioCallSid)
      .select('campaign_id, campaign_recipient_id')
      .single();

    // Also update campaign recipient if linked
    if (callLog?.campaign_recipient_id) {
      await supabase
        .from('admin_call_campaign_recipients')
        .update({
          status: 'answered', // Manually ended = answered
          call_ended_at: new Date().toISOString(),
        })
        .eq('id', callLog.campaign_recipient_id);
      
      console.log(`[call-center-end] Updated recipient ${callLog.campaign_recipient_id} to answered`);
    }

    // Update campaign stats and trigger next call
    if (callLog?.campaign_id) {
      // Recalculate stats from recipients
      const { data: recipients } = await supabase
        .from('admin_call_campaign_recipients')
        .select('status')
        .eq('campaign_id', callLog.campaign_id);

      if (recipients) {
        const queuedCount = recipients.filter(r => r.status === 'queued').length;
        const answeredCount = recipients.filter(r => r.status === 'answered').length;
        const voicemailCount = recipients.filter(r => r.status === 'voicemail').length;
        const failedCount = recipients.filter(r => ['failed', 'skipped'].includes(r.status)).length;
        const calledCount = recipients.length - queuedCount;

        await supabase
          .from('admin_call_campaigns')
          .update({
            queued_count: queuedCount,
            called_count: calledCount,
            answered_count: answeredCount,
            voicemail_count: voicemailCount,
            failed_count: failedCount,
          })
          .eq('id', callLog.campaign_id);

        console.log(`[call-center-end] Updated campaign stats: queued=${queuedCount}, answered=${answeredCount}, failed=${failedCount}`);
      }

      // Check if campaign should proceed
      const { data: campaign } = await supabase
        .from('admin_call_campaigns')
        .select('status')
        .eq('id', callLog.campaign_id)
        .single();

      const { data: remainingRecipients } = await supabase
        .from('admin_call_campaign_recipients')
        .select('id')
        .eq('campaign_id', callLog.campaign_id)
        .eq('status', 'queued')
        .limit(1);

      if (campaign?.status === 'running' && remainingRecipients && remainingRecipients.length > 0) {
        console.log(`[call-center-end] Triggering next call for campaign ${callLog.campaign_id}`);
        
        // Reset last_call_at to allow immediate next call
        await supabase
          .from('admin_call_campaigns')
          .update({ last_call_at: null })
          .eq('id', callLog.campaign_id);

        const APP_BASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';
        fetch(`${APP_BASE_URL}/functions/v1/call-center-tick`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).catch(err => console.error('[call-center-end] Failed to trigger tick:', err));
      } else if (!remainingRecipients || remainingRecipients.length === 0) {
        // Campaign complete
        console.log(`[call-center-end] Campaign ${callLog.campaign_id} completed`);
        await supabase
          .from('admin_call_campaigns')
          .update({
            status: 'completed',
            finished_at: new Date().toISOString(),
          })
          .eq('id', callLog.campaign_id)
          .eq('status', 'running');
      }
    }

    console.log(`Call ${twilioCallSid} ended successfully`);

    return new Response(
      JSON.stringify({ success: true, message: 'Call ended' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('End call error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
