import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const callSid = formData.get('CallSid') as string;
    const callStatus = formData.get('CallStatus') as string;
    const callDuration = formData.get('CallDuration') as string;
    const timestamp = formData.get('Timestamp') as string;

    console.log(`[call-center-status] Call status update: ${callSid} -> ${callStatus}, duration: ${callDuration}s`);

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

    console.log(`[call-center-status] Mapped status: ${mappedStatus}, isTerminal: ${isTerminalStatus}`);

    // Update call log
    const updateData: any = {
      status: mappedStatus,
    };

    if (callStatus === 'in-progress') {
      updateData.call_answered_at = new Date().toISOString();
    }

    if (isTerminalStatus) {
      updateData.call_ended_at = new Date().toISOString();
      if (callDuration) {
        updateData.call_duration_seconds = parseInt(callDuration, 10);
      }
    }

    // Update by Twilio call SID
    const { data: callLog, error } = await supabase
      .from('admin_call_logs')
      .update(updateData)
      .eq('twilio_call_sid', callSid)
      .select()
      .single();

    if (error) {
      console.error('[call-center-status] Failed to update call log:', error);
    } else {
      console.log(`[call-center-status] Updated call log ${callLog?.id} to status: ${mappedStatus}`);

      // Also update campaign recipient if linked
      if (callLog?.campaign_recipient_id) {
        // Determine proper recipient status based on call outcome
        let recipientStatus: string;
        const durationSeconds = parseInt(callDuration || '0', 10);
        
        if (callStatus === 'in-progress') {
          // Call answered and in progress
          recipientStatus = 'answered';
        } else if (callStatus === 'completed') {
          // Call completed - check if it was actually answered (duration > 0)
          recipientStatus = durationSeconds > 0 ? 'answered' : 'failed';
        } else if (callStatus === 'busy' || callStatus === 'no-answer' || callStatus === 'failed' || callStatus === 'canceled') {
          recipientStatus = 'failed';
        } else if (callStatus === 'ringing') {
          recipientStatus = 'ringing';
        } else {
          recipientStatus = 'calling';
        }

        console.log(`[call-center-status] Updating recipient ${callLog.campaign_recipient_id} to: ${recipientStatus}`);

        const recipientUpdate: any = {
          status: recipientStatus,
        };

        if (isTerminalStatus) {
          recipientUpdate.call_ended_at = new Date().toISOString();
          if (callDuration) {
            recipientUpdate.call_duration_seconds = parseInt(callDuration, 10);
          }
        }

        await supabase
          .from('admin_call_campaign_recipients')
          .update(recipientUpdate)
          .eq('id', callLog.campaign_recipient_id);
      }

      // Update campaign counts if applicable and this is a terminal status
      if (callLog?.campaign_id && isTerminalStatus) {
        console.log(`[call-center-status] Updating campaign ${callLog.campaign_id} stats`);
        
        // Recalculate campaign stats
        const { data: recipients } = await supabase
          .from('admin_call_campaign_recipients')
          .select('status')
          .eq('campaign_id', callLog.campaign_id);

        if (recipients) {
          const queuedCount = recipients.filter(r => r.status === 'queued').length;
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

          console.log(`[call-center-status] Campaign stats: queued=${queuedCount}, called=${calledCount}, answered=${answeredCount}, voicemail=${voicemailCount}, failed=${failedCount}`);

          await supabase
            .from('admin_call_campaigns')
            .update(stats)
            .eq('id', callLog.campaign_id);

          // CRITICAL: Trigger the next call immediately after a terminal status
          // This ensures the campaign advances without waiting for cron
          const { data: campaign } = await supabase
            .from('admin_call_campaigns')
            .select('status')
            .eq('id', callLog.campaign_id)
            .single();

          if (campaign?.status === 'running') {
            console.log(`[call-center-status] Triggering next call for campaign ${callLog.campaign_id}`);
            
            const APP_BASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';
            
            // Trigger tick in background (fire and forget)
            fetch(`${APP_BASE_URL}/functions/v1/call-center-tick`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
            }).catch(err => console.error('[call-center-status] Failed to trigger tick:', err));
          }
        }
      }
    }

    return new Response('OK', {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });

  } catch (error) {
    console.error('[call-center-status] Call status webhook error:', error);
    return new Response('Error', {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });
  }
});
