import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Campaign Tick Handler - Processes one recipient at a time
 * Called periodically by cron or triggered by call-center-status after call completion
 * 
 * CRITICAL: When triggered after a call completes, last_call_at is reset to null
 * to allow immediate next call placement (no spacing delay).
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

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Find running campaigns
    const { data: campaigns, error: campaignsError } = await supabase
      .from('admin_call_campaigns')
      .select('*')
      .eq('status', 'running');

    if (campaignsError) {
      console.error('[call-center-tick] Failed to fetch campaigns:', campaignsError);
      return new Response(JSON.stringify({ error: campaignsError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!campaigns || campaigns.length === 0) {
      console.log('[call-center-tick] No running campaigns');
      return new Response(JSON.stringify({ message: 'No running campaigns' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let callsPlaced = 0;

    for (const campaign of campaigns) {
      // Check call spacing ONLY if last_call_at is set
      // When a call completes, call-center-status resets last_call_at to null
      if (campaign.last_call_at) {
        const lastCall = new Date(campaign.last_call_at);
        const spacing = (campaign.call_spacing_seconds || 5) * 1000; // Default 5 seconds
        const timeSinceLastCall = Date.now() - lastCall.getTime();
        
        if (timeSinceLastCall < spacing) {
          console.log(`[call-center-tick] Campaign ${campaign.id}: Spacing not met (${Math.round(timeSinceLastCall/1000)}s < ${campaign.call_spacing_seconds || 5}s)`);
          continue;
        }
      }

      // Check if there's already an active call for this campaign
      const { data: activeRecipients } = await supabase
        .from('admin_call_campaign_recipients')
        .select('id, phone_e164, status, call_started_at, twilio_call_sid')
        .eq('campaign_id', campaign.id)
        .in('status', ['calling', 'ringing', 'in-progress'])
        .limit(1);

      if (activeRecipients && activeRecipients.length > 0) {
        const activeRecipient = activeRecipients[0];
        const callStartTime = new Date(activeRecipient.call_started_at).getTime();
        const callDuration = Date.now() - callStartTime;
        const MAX_CALL_DURATION_MS = 120000; // 2 minutes max

        // If call has been active for more than 2 minutes, force-complete it
        if (callDuration > MAX_CALL_DURATION_MS) {
          console.log(`[call-center-tick] Campaign ${campaign.id}: Call to ${activeRecipient.phone_e164} stuck for ${Math.round(callDuration/1000)}s, force-completing`);
          
          // Mark as answered (call was placed, assume it went through)
          await supabase
            .from('admin_call_campaign_recipients')
            .update({
              status: 'answered',
              call_ended_at: new Date().toISOString(),
              error_message: 'Auto-completed after timeout',
            })
            .eq('id', activeRecipient.id);

          // Update call log
          await supabase
            .from('admin_call_logs')
            .update({
              status: 'completed',
              call_ended_at: new Date().toISOString(),
            })
            .eq('twilio_call_sid', activeRecipient.twilio_call_sid);

          // Log event
          await supabase.from('call_events').insert({
            source: 'tick-timeout',
            campaign_id: campaign.id,
            campaign_recipient_id: activeRecipient.id,
            phone_e164: activeRecipient.phone_e164,
            twilio_call_sid: activeRecipient.twilio_call_sid,
            twilio_call_status: 'timeout',
            mapped_status: 'answered',
            details: { 
              duration_ms: callDuration,
              reason: 'No status callback received within timeout',
            },
          });

          // Reset last_call_at to allow next call
          await supabase
            .from('admin_call_campaigns')
            .update({ last_call_at: null })
            .eq('id', campaign.id);

          // Recalculate stats
          const { data: allRecipients } = await supabase
            .from('admin_call_campaign_recipients')
            .select('status')
            .eq('campaign_id', campaign.id);

          if (allRecipients) {
            const queuedCount = allRecipients.filter(r => r.status === 'queued').length;
            const answeredCount = allRecipients.filter(r => r.status === 'answered').length;
            const voicemailCount = allRecipients.filter(r => r.status === 'voicemail').length;
            const failedCount = allRecipients.filter(r => ['failed', 'skipped'].includes(r.status)).length;

            await supabase
              .from('admin_call_campaigns')
              .update({
                queued_count: queuedCount,
                answered_count: answeredCount,
                voicemail_count: voicemailCount,
                failed_count: failedCount,
                called_count: allRecipients.length - queuedCount,
              })
              .eq('id', campaign.id);
          }

          // Don't place another call this tick, let it handle next iteration
          continue;
        }

        console.log(`[call-center-tick] Campaign ${campaign.id}: Active call in progress (${activeRecipient.phone_e164}, ${Math.round(callDuration/1000)}s)`);
        continue;
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
        console.log(`[call-center-tick] Campaign ${campaign.id}: No more queued recipients, marking complete`);
        
        await supabase
          .from('admin_call_campaigns')
          .update({ 
            status: 'completed',
            finished_at: new Date().toISOString()
          })
          .eq('id', campaign.id);
        
        continue;
      }

      console.log(`[call-center-tick] Placing call to ${recipient.phone_e164} for campaign ${campaign.id}`);

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
          direction: 'outbound',
        })
        .select()
        .single();

      if (logError) {
        console.error('[call-center-tick] Failed to create call log:', logError);
        continue;
      }

      // Build Twilio call parameters
      const twimlUrl = `${APP_BASE_URL}/functions/v1/call-center-twiml?callLogId=${callLog.id}&firstName=${encodeURIComponent(recipient.first_name || '')}`;
      const statusCallbackUrl = `${APP_BASE_URL}/functions/v1/call-center-status`;
      const amdCallbackUrl = `${APP_BASE_URL}/functions/v1/call-center-amd`;
      const recordingCallbackUrl = `${APP_BASE_URL}/functions/v1/call-center-recording`;

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
              // CRITICAL: Include ALL terminal status events for reliable campaign progression
              // Without busy/no-answer/failed/canceled, webhook never fires for unanswered calls
              StatusCallbackEvent: 'initiated ringing answered completed busy no-answer failed canceled',
              StatusCallbackMethod: 'POST',
              MachineDetection: 'DetectMessageEnd',
              AsyncAmd: 'true',
              AsyncAmdStatusCallback: amdCallbackUrl,
              AsyncAmdStatusCallbackMethod: 'POST',
              Record: 'true',
              RecordingStatusCallback: recordingCallbackUrl,
              RecordingStatusCallbackEvent: 'completed',
            }),
          }
        );

        const twilioData = await twilioResponse.json();

        if (twilioResponse.ok && twilioData.sid) {
          console.log(`[call-center-tick] Call placed successfully: ${twilioData.sid}`);

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

          // Update campaign last_call_at
          await supabase
            .from('admin_call_campaigns')
            .update({
              last_call_at: new Date().toISOString(),
              called_count: (campaign.called_count || 0) + 1,
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
              attempt: (recipient.attempt_count || 0) + 1,
              latency_ms: Date.now() - startTime,
            },
          });

          callsPlaced++;
        } else {
          // Call placement failed
          console.error('[call-center-tick] Twilio call failed:', twilioData);
          
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

          // Log failure event
          await supabase.from('call_events').insert({
            source: 'tick-failed',
            campaign_id: campaign.id,
            campaign_recipient_id: recipient.id,
            call_log_id: callLog.id,
            phone_e164: recipient.phone_e164,
            twilio_call_status: 'failed',
            mapped_status: 'failed',
            details: { 
              error_code: twilioData.code,
              error_message: twilioData.message,
            },
          });

          // Reset last_call_at to allow immediate retry of next number
          await supabase
            .from('admin_call_campaigns')
            .update({ last_call_at: null })
            .eq('id', campaign.id);
        }
      } catch (callError) {
        console.error('[call-center-tick] Call placement exception:', callError);
        
        // Mark as failed
        await supabase
          .from('admin_call_campaign_recipients')
          .update({
            status: 'failed',
            error_message: callError instanceof Error ? callError.message : 'Unknown error',
            call_ended_at: new Date().toISOString(),
          })
          .eq('id', recipient.id);
      }
    }

    console.log(`[call-center-tick] Completed in ${Date.now() - startTime}ms, placed ${callsPlaced} calls`);

    return new Response(JSON.stringify({ 
      success: true, 
      callsPlaced,
      message: `Processed ${campaigns.length} campaigns, placed ${callsPlaced} calls`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[call-center-tick] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
