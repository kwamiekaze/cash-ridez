import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Call Center Status Webhook - Receives Twilio status callbacks
 * 
 * CRITICAL: This webhook must reliably:
 * 1. Update admin_call_logs with call status
 * 2. Update admin_call_campaign_recipients to terminal states (answered/failed)
 * 3. Recalculate campaign stats
 * 4. Trigger call-center-tick to advance campaign to next number
 * 
 * All Twilio callbacks must return 200 OK to prevent retries.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const formData = await req.formData();
    const callSid = formData.get('CallSid') as string;
    const callStatus = formData.get('CallStatus') as string;
    const callDuration = formData.get('CallDuration') as string;
    const timestamp = formData.get('Timestamp') as string;

    console.log(`[call-center-status] Webhook received: CallSid=${callSid}, Status=${callStatus}, Duration=${callDuration}s`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Map Twilio status to our internal status
    const statusMap: Record<string, string> = {
      'queued': 'initiated',
      'initiated': 'initiated',
      'ringing': 'ringing',
      'in-progress': 'in-progress',
      'completed': 'completed',
      'busy': 'busy',
      'no-answer': 'no-answer',
      'canceled': 'failed',
      'failed': 'failed',
    };

    const mappedStatus = statusMap[callStatus] || callStatus;
    const isTerminalStatus = ['completed', 'busy', 'no-answer', 'failed'].includes(mappedStatus);
    const durationSeconds = parseInt(callDuration || '0', 10);

    console.log(`[call-center-status] Mapped: ${mappedStatus}, isTerminal: ${isTerminalStatus}, duration: ${durationSeconds}s`);

    // Build update data for call log
    const callLogUpdate: Record<string, any> = {
      status: mappedStatus,
    };

    if (callStatus === 'in-progress') {
      callLogUpdate.call_answered_at = new Date().toISOString();
    }

    if (isTerminalStatus) {
      callLogUpdate.call_ended_at = new Date().toISOString();
      if (callDuration) {
        callLogUpdate.call_duration_seconds = durationSeconds;
      }
    }

    // Update call log by Twilio call SID
    const { data: callLog, error: logError } = await supabase
      .from('admin_call_logs')
      .update(callLogUpdate)
      .eq('twilio_call_sid', callSid)
      .select('id, campaign_id, campaign_recipient_id, phone_e164')
      .single();

    if (logError) {
      console.error('[call-center-status] Failed to update call log:', logError);
    } else {
      console.log(`[call-center-status] Updated call log ${callLog?.id} to: ${mappedStatus}`);
    }

    // Insert call event for observability (fire and forget)
    supabase.from('call_events').insert({
      source: 'twilio-webhook',
      campaign_id: callLog?.campaign_id || null,
      campaign_recipient_id: callLog?.campaign_recipient_id || null,
      call_log_id: callLog?.id || null,
      phone_e164: callLog?.phone_e164 || null,
      twilio_call_sid: callSid,
      twilio_call_status: callStatus,
      mapped_status: mappedStatus,
      details: {
        duration_seconds: durationSeconds,
        timestamp: timestamp,
        latency_ms: Date.now() - startTime,
        is_terminal: isTerminalStatus,
      },
    }).then(({ error }) => {
      if (error) console.error('[call-center-status] Failed to log call_event:', error);
    });

    // Update campaign recipient if linked
    if (callLog?.campaign_recipient_id) {
      let recipientStatus: string;
      const recipientUpdate: Record<string, any> = {};

      if (callStatus === 'ringing') {
        recipientStatus = 'ringing';
      } else if (callStatus === 'in-progress') {
        recipientStatus = 'in-progress';
      } else if (isTerminalStatus) {
        // Terminal status - mark as answered or failed
        if (callStatus === 'completed') {
          // Call completed = answered (even if 0 duration, it means call connected)
          recipientStatus = 'answered';
        } else {
          // busy, no-answer, failed, canceled = failed
          recipientStatus = 'failed';
        }
        recipientUpdate.call_ended_at = new Date().toISOString();
        if (callDuration) {
          recipientUpdate.call_duration_seconds = durationSeconds;
        }
      } else {
        recipientStatus = 'calling';
      }

      recipientUpdate.status = recipientStatus;

      console.log(`[call-center-status] Updating recipient ${callLog.campaign_recipient_id} to: ${recipientStatus}`);

      const { error: recipientError } = await supabase
        .from('admin_call_campaign_recipients')
        .update(recipientUpdate)
        .eq('id', callLog.campaign_recipient_id);

      if (recipientError) {
        console.error('[call-center-status] Failed to update recipient:', recipientError);
      } else {
        console.log(`[call-center-status] Recipient ${callLog.campaign_recipient_id} updated successfully`);
      }
    }

    // Update campaign counts and trigger next call if applicable
    if (callLog?.campaign_id && isTerminalStatus) {
      console.log(`[call-center-status] Processing terminal status for campaign ${callLog.campaign_id}`);

      // Recalculate campaign stats from recipients
      const { data: recipients, error: recipientsError } = await supabase
        .from('admin_call_campaign_recipients')
        .select('status')
        .eq('campaign_id', callLog.campaign_id);

      if (recipientsError) {
        console.error('[call-center-status] Failed to fetch recipients:', recipientsError);
      } else if (recipients) {
        const queuedCount = recipients.filter(r => r.status === 'queued').length;
        const inProgressCount = recipients.filter(r => 
          ['calling', 'ringing', 'in-progress'].includes(r.status)
        ).length;
        const answeredCount = recipients.filter(r => r.status === 'answered').length;
        const voicemailCount = recipients.filter(r => r.status === 'voicemail').length;
        const failedCount = recipients.filter(r => ['failed', 'skipped'].includes(r.status)).length;
        const calledCount = recipients.length - queuedCount;

        console.log(`[call-center-status] Campaign stats: queued=${queuedCount}, in_progress=${inProgressCount}, called=${calledCount}, answered=${answeredCount}, voicemail=${voicemailCount}, failed=${failedCount}`);

        // Update campaign stats
        const { error: statsError } = await supabase
          .from('admin_call_campaigns')
          .update({
            queued_count: queuedCount,
            called_count: calledCount,
            answered_count: answeredCount,
            voicemail_count: voicemailCount,
            failed_count: failedCount,
          })
          .eq('id', callLog.campaign_id);

        if (statsError) {
          console.error('[call-center-status] Failed to update campaign stats:', statsError);
        }

        // Check if we should trigger next call
        if (inProgressCount === 0 && queuedCount > 0) {
          // No calls in progress and there are queued recipients - trigger next call
          const { data: campaign } = await supabase
            .from('admin_call_campaigns')
            .select('status')
            .eq('id', callLog.campaign_id)
            .single();

          if (campaign?.status === 'running') {
            console.log(`[call-center-status] Triggering next call for campaign ${callLog.campaign_id}`);

            // Reset last_call_at to allow immediate next call (bypass spacing)
            await supabase
              .from('admin_call_campaigns')
              .update({ last_call_at: null })
              .eq('id', callLog.campaign_id);

            const APP_BASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';

            // Trigger tick immediately
            fetch(`${APP_BASE_URL}/functions/v1/call-center-tick`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            }).catch(err => console.error('[call-center-status] Failed to trigger tick:', err));
          }
        }

        // Check if campaign is complete
        if (queuedCount === 0 && inProgressCount === 0) {
          console.log(`[call-center-status] Campaign ${callLog.campaign_id} completed - all recipients processed`);
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
    }

    console.log(`[call-center-status] Completed in ${Date.now() - startTime}ms`);

    return new Response('OK', {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });

  } catch (error) {
    console.error('[call-center-status] Webhook error:', error);
    // Always return 200 to Twilio to prevent retries
    return new Response('OK', {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });
  }
});
