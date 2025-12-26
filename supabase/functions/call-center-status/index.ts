import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Call Center Status Webhook - Receives Twilio status callbacks
 * 
 * CRITICAL: This webhook must reliably update both admin_call_logs and 
 * admin_call_campaign_recipients to terminal states so the campaign can advance.
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

    console.log(`[call-center-status] Status update: ${callSid} -> ${callStatus}, duration: ${callDuration}s`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Map Twilio status to our status
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
    const callLogUpdate: any = {
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

    // Insert call event for observability
    await supabase.from('call_events').insert({
      source: 'webhook',
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
      },
    }).then(({ error }) => {
      if (error) console.error('[call-center-status] Failed to log call_event:', error);
    });

    // Update campaign recipient if linked
    if (callLog?.campaign_recipient_id) {
      // Determine recipient status based on call outcome
      // CRITICAL: On terminal status, set to 'answered' or 'failed' so campaign can advance
      let recipientStatus: string;
      let recipientUpdate: any = {};

      if (callStatus === 'ringing') {
        recipientStatus = 'ringing';
      } else if (callStatus === 'in-progress') {
        recipientStatus = 'in-progress';
      } else if (isTerminalStatus) {
        // Terminal status reached
        if (callStatus === 'completed' && durationSeconds > 0) {
          // Call was answered and completed with duration
          recipientStatus = 'answered';
        } else if (callStatus === 'completed' && durationSeconds === 0) {
          // "Completed" but no duration - likely voicemail or immediate hangup
          recipientStatus = 'answered'; // Still count as reached
        } else {
          // busy, no-answer, failed, canceled
          recipientStatus = 'failed';
        }
        recipientUpdate.call_ended_at = new Date().toISOString();
        if (callDuration) {
          recipientUpdate.call_duration_seconds = durationSeconds;
        }
      } else {
        // Non-terminal, keep calling
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
      }
    }

    // Update campaign counts if applicable and this is a terminal status
    if (callLog?.campaign_id && isTerminalStatus) {
      console.log(`[call-center-status] Recalculating campaign ${callLog.campaign_id} stats`);

      // Recalculate campaign stats from recipients
      const { data: recipients } = await supabase
        .from('admin_call_campaign_recipients')
        .select('status')
        .eq('campaign_id', callLog.campaign_id);

      if (recipients) {
        const queuedCount = recipients.filter(r => r.status === 'queued').length;
        const inProgressCount = recipients.filter(r => 
          ['calling', 'ringing', 'in-progress'].includes(r.status)
        ).length;
        const calledCount = recipients.filter(r => r.status !== 'queued').length;
        const answeredCount = recipients.filter(r => r.status === 'answered').length;
        const voicemailCount = recipients.filter(r => r.status === 'voicemail').length;
        const failedCount = recipients.filter(r => r.status === 'failed' || r.status === 'skipped').length;

        const stats = {
          queued_count: queuedCount,
          called_count: calledCount,
          answered_count: answeredCount,
          voicemail_count: voicemailCount,
          failed_count: failedCount,
          last_call_at: new Date().toISOString(),
        };

        console.log(`[call-center-status] Campaign stats: queued=${queuedCount}, in_progress=${inProgressCount}, called=${calledCount}, answered=${answeredCount}, voicemail=${voicemailCount}, failed=${failedCount}`);

        await supabase
          .from('admin_call_campaigns')
          .update(stats)
          .eq('id', callLog.campaign_id);

        // Check if campaign is still running and there are no in-progress calls
        // If so, trigger the next call
        if (inProgressCount === 0 && queuedCount > 0) {
          const { data: campaign } = await supabase
            .from('admin_call_campaigns')
            .select('status')
            .eq('id', callLog.campaign_id)
            .single();

          if (campaign?.status === 'running') {
            console.log(`[call-center-status] Triggering next call for campaign ${callLog.campaign_id}`);

            const APP_BASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';

            // Trigger tick immediately (fire and forget)
            fetch(`${APP_BASE_URL}/functions/v1/call-center-tick`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
            }).catch(err => console.error('[call-center-status] Failed to trigger tick:', err));
          }
        }

        // Check if campaign is complete (no more queued and no in-progress)
        if (queuedCount === 0 && inProgressCount === 0) {
          console.log(`[call-center-status] Campaign ${callLog.campaign_id} completed`);
          await supabase
            .from('admin_call_campaigns')
            .update({
              status: 'completed',
              finished_at: new Date().toISOString(),
            })
            .eq('id', callLog.campaign_id)
            .eq('status', 'running'); // Only if still running
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
