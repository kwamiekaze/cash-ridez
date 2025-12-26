import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Call Center Status Webhook - Receives Twilio status callbacks
 * 
 * CRITICAL: This is the primary endpoint for call lifecycle management.
 * Twilio sends callbacks for: initiated, ringing, answered, completed
 * 
 * The CallStatus field in the completed event tells us the final outcome:
 * - completed: Call was answered and ended normally
 * - busy: Callee was busy
 * - no-answer: Callee didn't answer within timeout
 * - failed: Call failed (network/carrier issues)
 * - canceled: Call was canceled before connecting
 * 
 * This webhook must reliably:
 * 1. Update admin_call_logs with call status
 * 2. Update admin_call_campaign_recipients to terminal states
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
  console.log('[call-center-status] ====== WEBHOOK RECEIVED ======');
  console.log('[call-center-status] Method:', req.method);
  console.log('[call-center-status] URL:', req.url);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Parse form data from Twilio
    const formData = await req.formData();
    
    // Log all received parameters for debugging
    const allParams: Record<string, string> = {};
    formData.forEach((value, key) => {
      allParams[key] = value.toString();
    });
    console.log('[call-center-status] All params:', JSON.stringify(allParams));
    
    const callSid = formData.get('CallSid') as string;
    const callStatus = formData.get('CallStatus') as string;
    const callDuration = formData.get('CallDuration') as string;
    const timestamp = formData.get('Timestamp') as string;
    const answeredBy = formData.get('AnsweredBy') as string;
    const sequenceNumber = formData.get('SequenceNumber') as string;

    console.log(`[call-center-status] Processing: CallSid=${callSid}, CallStatus=${callStatus}, Duration=${callDuration}s, AnsweredBy=${answeredBy || 'N/A'}, Seq=${sequenceNumber}`);

    if (!callSid) {
      console.log('[call-center-status] No CallSid provided, ignoring');
      return new Response('OK', {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Map Twilio CallStatus to our internal status
    const statusMap: Record<string, string> = {
      'queued': 'initiated',
      'initiated': 'initiated',
      'ringing': 'ringing',
      'in-progress': 'in-progress',
      'completed': 'completed',
      'busy': 'busy',
      'no-answer': 'no-answer',
      'canceled': 'canceled',
      'failed': 'failed',
    };

    const mappedStatus = statusMap[callStatus] || callStatus;
    
    // These are all terminal statuses - call is over
    const isTerminalStatus = ['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(callStatus);
    const durationSeconds = parseInt(callDuration || '0', 10);

    console.log(`[call-center-status] Mapped: mappedStatus=${mappedStatus}, isTerminal=${isTerminalStatus}, duration=${durationSeconds}s`);

    // Build update data for call log
    const callLogUpdate: Record<string, any> = {
      status: mappedStatus,
    };

    if (callStatus === 'in-progress' || callStatus === 'answered') {
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
      console.log(`[call-center-status] Updated call log ${callLog?.id}: status=${mappedStatus}`);
    }

    // Insert call event for observability
    await supabase.from('call_events').insert({
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
        answered_by: answeredBy || null,
        timestamp: timestamp,
        sequence_number: sequenceNumber,
        latency_ms: Date.now() - startTime,
        is_terminal: isTerminalStatus,
        all_params: allParams,
      },
    });

    // Update campaign recipient if linked
    if (callLog?.campaign_recipient_id) {
      let recipientStatus: string;
      const recipientUpdate: Record<string, any> = {};

      if (callStatus === 'ringing') {
        recipientStatus = 'ringing';
      } else if (callStatus === 'in-progress' || callStatus === 'answered') {
        recipientStatus = 'in-progress';
      } else if (isTerminalStatus) {
        // Determine final recipient status based on CallStatus
        if (callStatus === 'completed') {
          // Call was answered and ended normally
          // Check if we already marked this as voicemail via AMD callback
          const { data: existingRecipient } = await supabase
            .from('admin_call_campaign_recipients')
            .select('status')
            .eq('id', callLog.campaign_recipient_id)
            .single();
          
          if (existingRecipient?.status === 'voicemail') {
            recipientStatus = 'voicemail'; // Keep voicemail status
          } else {
            recipientStatus = 'answered';
          }
        } else if (callStatus === 'busy') {
          recipientStatus = 'failed';
          recipientUpdate.error_message = 'Line busy';
        } else if (callStatus === 'no-answer') {
          recipientStatus = 'failed';
          recipientUpdate.error_message = 'No answer';
        } else if (callStatus === 'canceled') {
          recipientStatus = 'failed';
          recipientUpdate.error_message = 'Call canceled';
        } else {
          // failed or unknown
          recipientStatus = 'failed';
          recipientUpdate.error_message = `Call failed: ${callStatus}`;
        }
        
        recipientUpdate.call_ended_at = new Date().toISOString();
        if (callDuration) {
          recipientUpdate.call_duration_seconds = durationSeconds;
        }
      } else {
        recipientStatus = 'calling';
      }

      recipientUpdate.status = recipientStatus;

      console.log(`[call-center-status] Updating recipient ${callLog.campaign_recipient_id}: status=${recipientStatus} (CallStatus=${callStatus})`);

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

        console.log(`[call-center-status] Campaign stats: queued=${queuedCount}, inProgress=${inProgressCount}, called=${calledCount}, answered=${answeredCount}, voicemail=${voicemailCount}, failed=${failedCount}`);

        // Update campaign stats - CRITICAL: reset last_call_at to allow immediate next call
        const { error: statsError } = await supabase
          .from('admin_call_campaigns')
          .update({
            queued_count: queuedCount,
            called_count: calledCount,
            answered_count: answeredCount,
            voicemail_count: voicemailCount,
            failed_count: failedCount,
            last_call_at: null, // Reset to allow immediate next call
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
            console.log(`[call-center-status] Campaign ${callLog.campaign_id} is running with ${queuedCount} queued - triggering next call`);

            const APP_BASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';

            // Trigger tick immediately - fire and forget but log result
            fetch(`${APP_BASE_URL}/functions/v1/call-center-tick`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            }).then(response => {
              console.log(`[call-center-status] Triggered call-center-tick: status=${response.status}`);
            }).catch(err => {
              console.error('[call-center-status] Failed to trigger tick:', err);
            });
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

    console.log(`[call-center-status] ====== COMPLETED in ${Date.now() - startTime}ms ======`);

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
