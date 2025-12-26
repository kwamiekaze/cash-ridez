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
 * 4. Set next_run_at to now + call_spacing_seconds (30s default) for pacing
 * 5. Trigger call-center-tick to advance campaign after delay
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('[call-center-status] ====== WEBHOOK RECEIVED ======');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const formData = await req.formData();
    
    const allParams: Record<string, string> = {};
    formData.forEach((value, key) => {
      allParams[key] = value.toString();
    });
    console.log('[call-center-status] Params:', JSON.stringify(allParams));
    
    const callSid = formData.get('CallSid') as string;
    const callStatus = formData.get('CallStatus') as string;
    const callDuration = formData.get('CallDuration') as string;
    const answeredBy = formData.get('AnsweredBy') as string;
    const sequenceNumber = formData.get('SequenceNumber') as string;

    console.log(`[call-center-status] CallSid=${callSid}, CallStatus=${callStatus}, Duration=${callDuration}s`);

    if (!callSid) {
      console.log('[call-center-status] No CallSid, ignoring');
      return new Response('OK', { headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

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
    const isTerminalStatus = ['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(callStatus);
    const durationSeconds = parseInt(callDuration || '0', 10);

    console.log(`[call-center-status] mappedStatus=${mappedStatus}, isTerminal=${isTerminalStatus}`);

    // Update call log
    const callLogUpdate: Record<string, any> = { status: mappedStatus };

    if (callStatus === 'in-progress' || callStatus === 'answered') {
      callLogUpdate.call_answered_at = new Date().toISOString();
    }

    if (isTerminalStatus) {
      callLogUpdate.call_ended_at = new Date().toISOString();
      if (callDuration) {
        callLogUpdate.call_duration_seconds = durationSeconds;
      }
    }

    const { data: callLog, error: logError } = await supabase
      .from('admin_call_logs')
      .update(callLogUpdate)
      .eq('twilio_call_sid', callSid)
      .select('id, campaign_id, campaign_recipient_id, phone_e164')
      .single();

    if (logError) {
      console.error('[call-center-status] Call log update failed:', logError);
    } else {
      console.log(`[call-center-status] Call log ${callLog?.id} updated`);
    }

    // Insert call event
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
        sequence_number: sequenceNumber,
        is_terminal: isTerminalStatus,
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
        if (callStatus === 'completed') {
          // Check if already marked as voicemail by AMD
          const { data: existingRecipient } = await supabase
            .from('admin_call_campaign_recipients')
            .select('status')
            .eq('id', callLog.campaign_recipient_id)
            .single();
          
          recipientStatus = existingRecipient?.status === 'voicemail' ? 'voicemail' : 'answered';
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

      console.log(`[call-center-status] Recipient ${callLog.campaign_recipient_id}: status=${recipientStatus}`);

      await supabase
        .from('admin_call_campaign_recipients')
        .update(recipientUpdate)
        .eq('id', callLog.campaign_recipient_id);
    }

    // Handle terminal status for campaigns - set next_run_at with 30s delay
    if (callLog?.campaign_id && isTerminalStatus) {
      console.log(`[call-center-status] Terminal status for campaign ${callLog.campaign_id}`);

      // Get campaign config
      const { data: campaign } = await supabase
        .from('admin_call_campaigns')
        .select('status, call_spacing_seconds')
        .eq('id', callLog.campaign_id)
        .single();

      if (campaign) {
        // Recalculate stats
        const { data: recipients } = await supabase
          .from('admin_call_campaign_recipients')
          .select('status')
          .eq('campaign_id', callLog.campaign_id);

        if (recipients) {
          const queuedCount = recipients.filter((r: any) => r.status === 'queued').length;
          const inProgressCount = recipients.filter((r: any) => 
            ['calling', 'ringing', 'in-progress'].includes(r.status)
          ).length;
          const answeredCount = recipients.filter((r: any) => r.status === 'answered').length;
          const voicemailCount = recipients.filter((r: any) => r.status === 'voicemail').length;
          const failedCount = recipients.filter((r: any) => ['failed', 'skipped'].includes(r.status)).length;
          const calledCount = recipients.length - queuedCount;

          console.log(`[call-center-status] Stats: queued=${queuedCount}, inProgress=${inProgressCount}, answered=${answeredCount}, voicemail=${voicemailCount}, failed=${failedCount}`);

          // CRITICAL: Set next_run_at to enforce 30-second delay before next call
          const spacingSeconds = campaign.call_spacing_seconds || 30;
          const nextRunAt = new Date(Date.now() + spacingSeconds * 1000).toISOString();

          console.log(`[call-center-status] Setting next_run_at to ${nextRunAt} (${spacingSeconds}s delay)`);

          await supabase
            .from('admin_call_campaigns')
            .update({
              queued_count: queuedCount,
              called_count: calledCount,
              answered_count: answeredCount,
              voicemail_count: voicemailCount,
              failed_count: failedCount,
              active_call_sid: null,
              next_run_at: nextRunAt, // 30-second delay before next call
            })
            .eq('id', callLog.campaign_id);

          // Check if campaign is complete
          if (queuedCount === 0 && inProgressCount === 0) {
            console.log(`[call-center-status] Campaign ${callLog.campaign_id} completed`);
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
    }

    console.log(`[call-center-status] ====== DONE in ${Date.now() - startTime}ms ======`);

    return new Response('OK', { headers: corsHeaders });

  } catch (error) {
    console.error('[call-center-status] Error:', error);
    return new Response('OK', { headers: corsHeaders });
  }
});
