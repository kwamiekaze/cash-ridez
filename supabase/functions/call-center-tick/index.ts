import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Campaign Tick Handler - Processes one recipient at a time with proper locking
 * 
 * Called by:
 * 1. Cron job every minute (background execution - campaign continues even if UI closes)
 * 2. call-center-status after call completion (immediate advance)
 * 3. call-center-outbound-start when campaign starts
 * 
 * CRITICAL FEATURES:
 * - Single concurrency: Only one call at a time per campaign (using DB locking)
 * - 30-second pacing: next_run_at ensures 30-second gap between calls
 * - De-dupe: Won't call a number that's already been called in this campaign
 * - Background execution: Works independently of browser UI
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate a unique worker ID for this tick execution
const WORKER_ID = crypto.randomUUID().slice(0, 8);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const APP_BASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';
  const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!;
  const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
  const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')!;

  const startTime = Date.now();

  console.log(`[call-center-tick:${WORKER_ID}] ====== TICK START ======`);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Find running campaigns that are ready to dial
    // next_run_at must be null or <= now
    const { data: campaigns, error: campaignsError } = await supabase
      .from('admin_call_campaigns')
      .select('*')
      .eq('status', 'running')
      .or(`next_run_at.is.null,next_run_at.lte.${new Date().toISOString()}`);

    if (campaignsError) {
      console.error(`[call-center-tick:${WORKER_ID}] Failed to fetch campaigns:`, campaignsError);
      return new Response(JSON.stringify({ error: campaignsError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!campaigns || campaigns.length === 0) {
      console.log(`[call-center-tick:${WORKER_ID}] No running campaigns ready to dial`);
      return new Response(JSON.stringify({ message: 'No running campaigns' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let callsPlaced = 0;

    for (const campaign of campaigns) {
      console.log(`[call-center-tick:${WORKER_ID}] Processing campaign ${campaign.id} (${campaign.name || 'unnamed'})`);

      // CRITICAL: Check if campaign is locked by another worker
      if (campaign.lock_owner && campaign.lock_expires_at) {
        const lockExpires = new Date(campaign.lock_expires_at).getTime();
        if (lockExpires > Date.now()) {
          console.log(`[call-center-tick:${WORKER_ID}] Campaign ${campaign.id} locked by ${campaign.lock_owner} until ${campaign.lock_expires_at}`);
          continue;
        }
      }

      // CRITICAL: Check if there's already an active call for this campaign
      const { data: activeRecipients } = await supabase
        .from('admin_call_campaign_recipients')
        .select('id, phone_e164, status, call_started_at, call_ended_at, twilio_call_sid')
        .eq('campaign_id', campaign.id)
        .in('status', ['calling', 'ringing', 'in-progress'])
        .is('call_ended_at', null)
        .limit(1);

      if (activeRecipients && activeRecipients.length > 0) {
        const activeRecipient = activeRecipients[0];
        const callStartTime = new Date(activeRecipient.call_started_at).getTime();
        const callDuration = Date.now() - callStartTime;
        const MAX_CALL_DURATION_MS = 90000; // 90 seconds max

        // If call has been active too long, force-complete it
        if (callDuration > MAX_CALL_DURATION_MS) {
          console.log(`[call-center-tick:${WORKER_ID}] Call to ${activeRecipient.phone_e164} stuck for ${Math.round(callDuration/1000)}s, force-completing`);
          
          await supabase
            .from('admin_call_campaign_recipients')
            .update({
              status: 'answered',
              call_ended_at: new Date().toISOString(),
              error_message: 'Auto-completed after timeout',
            })
            .eq('id', activeRecipient.id);

          await supabase
            .from('admin_call_logs')
            .update({
              status: 'completed',
              call_ended_at: new Date().toISOString(),
            })
            .eq('twilio_call_sid', activeRecipient.twilio_call_sid);

          await supabase.from('call_events').insert({
            source: 'tick-timeout',
            campaign_id: campaign.id,
            campaign_recipient_id: activeRecipient.id,
            phone_e164: activeRecipient.phone_e164,
            twilio_call_sid: activeRecipient.twilio_call_sid,
            twilio_call_status: 'timeout',
            mapped_status: 'answered',
            details: { 
              worker_id: WORKER_ID,
              duration_ms: callDuration,
              reason: 'No status callback received within timeout',
            },
          });

          // Set next_run_at to allow next call after spacing delay
          const spacingSeconds = campaign.call_spacing_seconds || 30;
          await supabase
            .from('admin_call_campaigns')
            .update({
              next_run_at: new Date(Date.now() + spacingSeconds * 1000).toISOString(),
              active_call_sid: null,
            })
            .eq('id', campaign.id);

          // Recalculate stats
          await recalculateCampaignStats(supabase, campaign.id);
          continue;
        }

        console.log(`[call-center-tick:${WORKER_ID}] Campaign ${campaign.id}: Active call in progress (${activeRecipient.phone_e164}, ${Math.round(callDuration/1000)}s)`);
        continue;
      }

      // CRITICAL: Try to acquire lock on this campaign
      const lockExpiry = new Date(Date.now() + 60000).toISOString(); // 60 second lock
      const { data: lockResult, error: lockError } = await supabase
        .from('admin_call_campaigns')
        .update({
          lock_owner: WORKER_ID,
          lock_expires_at: lockExpiry,
        })
        .eq('id', campaign.id)
        .eq('status', 'running')
        .or(`lock_owner.is.null,lock_expires_at.lte.${new Date().toISOString()}`)
        .select('id')
        .single();

      if (lockError || !lockResult) {
        console.log(`[call-center-tick:${WORKER_ID}] Failed to acquire lock on campaign ${campaign.id}`);
        continue;
      }

      console.log(`[call-center-tick:${WORKER_ID}] Acquired lock on campaign ${campaign.id}`);

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
        console.log(`[call-center-tick:${WORKER_ID}] Campaign ${campaign.id}: No more queued recipients, marking complete`);
        
        await supabase
          .from('admin_call_campaigns')
          .update({ 
            status: 'completed',
            finished_at: new Date().toISOString(),
            lock_owner: null,
            lock_expires_at: null,
          })
          .eq('id', campaign.id);
        
        continue;
      }

      console.log(`[call-center-tick:${WORKER_ID}] Placing call to ${recipient.phone_e164} for campaign ${campaign.id}`);

      // Create call log
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
          direction: 'outbound',
        })
        .select()
        .single();

      if (logError) {
        console.error(`[call-center-tick:${WORKER_ID}] Failed to create call log:`, logError);
        // Release lock
        await supabase
          .from('admin_call_campaigns')
          .update({ lock_owner: null, lock_expires_at: null })
          .eq('id', campaign.id);
        continue;
      }

      // Build Twilio call parameters
      const twimlUrl = `${APP_BASE_URL}/functions/v1/call-center-twiml?callLogId=${callLog.id}&firstName=${encodeURIComponent(recipient.first_name || '')}`;
      const statusCallbackUrl = `${APP_BASE_URL}/functions/v1/call-center-status`;
      const amdCallbackUrl = `${APP_BASE_URL}/functions/v1/call-center-amd`;
      const recordingCallbackUrl = `${APP_BASE_URL}/functions/v1/call-center-recording`;

      try {
        const params = new URLSearchParams();
        params.append('To', recipient.phone_e164);
        params.append('From', TWILIO_PHONE_NUMBER);
        params.append('Url', twimlUrl);
        params.append('StatusCallback', statusCallbackUrl);
        params.append('StatusCallbackMethod', 'POST');
        params.append('StatusCallbackEvent', 'initiated');
        params.append('StatusCallbackEvent', 'ringing');
        params.append('StatusCallbackEvent', 'answered');
        params.append('StatusCallbackEvent', 'completed');
        params.append('MachineDetection', 'DetectMessageEnd');
        params.append('AsyncAmd', 'true');
        params.append('AsyncAmdStatusCallback', amdCallbackUrl);
        params.append('AsyncAmdStatusCallbackMethod', 'POST');
        params.append('Record', 'true');
        params.append('RecordingStatusCallback', recordingCallbackUrl);
        params.append('RecordingStatusCallbackEvent', 'completed');

        console.log(`[call-center-tick:${WORKER_ID}] Calling Twilio API...`);

        const twilioResponse = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params,
          }
        );

        const twilioData = await twilioResponse.json();

        if (twilioResponse.ok && twilioData.sid) {
          console.log(`[call-center-tick:${WORKER_ID}] Call placed: ${twilioData.sid} to ${recipient.phone_e164}`);

          // Update call log with Twilio SID
          await supabase
            .from('admin_call_logs')
            .update({ twilio_call_sid: twilioData.sid })
            .eq('id', callLog.id);

          // Update recipient status to calling
          await supabase
            .from('admin_call_campaign_recipients')
            .update({
              status: 'calling',
              twilio_call_sid: twilioData.sid,
              call_started_at: new Date().toISOString(),
              attempt_count: (recipient.attempt_count || 0) + 1,
              last_attempt_at: new Date().toISOString(),
            })
            .eq('id', recipient.id);

          // Update campaign - set active_call_sid and release lock (call will be tracked by SID)
          await supabase
            .from('admin_call_campaigns')
            .update({
              active_call_sid: twilioData.sid,
              last_call_at: new Date().toISOString(),
              called_count: (campaign.called_count || 0) + 1,
              lock_owner: null,
              lock_expires_at: null,
              next_run_at: null, // Will be set by call-center-status when call ends
            })
            .eq('id', campaign.id);

          // Log call event
          await supabase.from('call_events').insert({
            source: 'tick-placed',
            campaign_id: campaign.id,
            campaign_recipient_id: recipient.id,
            call_log_id: callLog.id,
            phone_e164: recipient.phone_e164,
            twilio_call_sid: twilioData.sid,
            twilio_call_status: 'initiated',
            mapped_status: 'initiated',
            details: { 
              worker_id: WORKER_ID,
              attempt: (recipient.attempt_count || 0) + 1,
              latency_ms: Date.now() - startTime,
            },
          });

          callsPlaced++;
        } else {
          // Call placement failed
          console.error(`[call-center-tick:${WORKER_ID}] Twilio call failed:`, twilioData);
          
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
              error_message: twilioData.message || 'Twilio call failed',
              call_ended_at: new Date().toISOString(),
            })
            .eq('id', recipient.id);

          await supabase.from('call_events').insert({
            source: 'tick-failed',
            campaign_id: campaign.id,
            campaign_recipient_id: recipient.id,
            call_log_id: callLog.id,
            phone_e164: recipient.phone_e164,
            twilio_call_status: 'failed',
            mapped_status: 'failed',
            details: { 
              worker_id: WORKER_ID,
              error_code: twilioData.code,
              error_message: twilioData.message,
            },
          });

          // Release lock and set next_run_at for retry
          const spacingSeconds = campaign.call_spacing_seconds || 30;
          await supabase
            .from('admin_call_campaigns')
            .update({ 
              lock_owner: null, 
              lock_expires_at: null,
              next_run_at: new Date(Date.now() + spacingSeconds * 1000).toISOString(),
            })
            .eq('id', campaign.id);

          // Recalculate stats
          await recalculateCampaignStats(supabase, campaign.id);
        }
      } catch (callError) {
        console.error(`[call-center-tick:${WORKER_ID}] Call exception:`, callError);
        
        await supabase
          .from('admin_call_campaign_recipients')
          .update({
            status: 'failed',
            error_message: callError instanceof Error ? callError.message : 'Unknown error',
            call_ended_at: new Date().toISOString(),
          })
          .eq('id', recipient.id);

        // Release lock
        await supabase
          .from('admin_call_campaigns')
          .update({ lock_owner: null, lock_expires_at: null })
          .eq('id', campaign.id);
      }
    }

    console.log(`[call-center-tick:${WORKER_ID}] ====== TICK COMPLETE in ${Date.now() - startTime}ms, placed ${callsPlaced} calls ======`);

    return new Response(JSON.stringify({ 
      success: true, 
      callsPlaced,
      workerId: WORKER_ID,
      message: `Processed ${campaigns.length} campaigns, placed ${callsPlaced} calls`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[call-center-tick:${WORKER_ID}] Error:`, error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper function to recalculate campaign statistics
async function recalculateCampaignStats(supabase: any, campaignId: string) {
  const { data: recipients } = await supabase
    .from('admin_call_campaign_recipients')
    .select('status')
    .eq('campaign_id', campaignId);

  if (recipients) {
    const queuedCount = recipients.filter((r: any) => r.status === 'queued').length;
    const answeredCount = recipients.filter((r: any) => r.status === 'answered').length;
    const voicemailCount = recipients.filter((r: any) => r.status === 'voicemail').length;
    const failedCount = recipients.filter((r: any) => ['failed', 'skipped'].includes(r.status)).length;

    await supabase
      .from('admin_call_campaigns')
      .update({
        queued_count: queuedCount,
        answered_count: answeredCount,
        voicemail_count: voicemailCount,
        failed_count: failedCount,
        called_count: recipients.length - queuedCount,
      })
      .eq('id', campaignId);
  }
}
