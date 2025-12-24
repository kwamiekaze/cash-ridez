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

    console.log(`Call status update: ${callSid} -> ${callStatus}, duration: ${callDuration}s`);

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

    // Update call log
    const updateData: any = {
      status: mappedStatus,
    };

    if (callStatus === 'in-progress') {
      updateData.call_answered_at = new Date().toISOString();
    }

    if (callStatus === 'completed' || callStatus === 'busy' || callStatus === 'no-answer' || callStatus === 'failed') {
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
      console.error('Failed to update call log:', error);
    } else {
      console.log(`Updated call log ${callLog?.id} to status: ${mappedStatus}`);

      // Also update campaign recipient if linked
      if (callLog?.campaign_recipient_id) {
        const recipientStatus = callStatus === 'completed' && parseInt(callDuration || '0', 10) > 10 
          ? 'answered' 
          : callStatus === 'no-answer' || callStatus === 'busy'
            ? 'failed'
            : callStatus === 'in-progress'
              ? 'answered'
              : 'calling';

        await supabase
          .from('admin_call_campaign_recipients')
          .update({
            status: recipientStatus,
            call_ended_at: updateData.call_ended_at || null,
            call_duration_seconds: updateData.call_duration_seconds || null,
          })
          .eq('id', callLog.campaign_recipient_id);
      }

      // Update campaign counts if applicable
      if (callLog?.campaign_id && (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'no-answer' || callStatus === 'busy')) {
        // Recalculate campaign stats
        const { data: recipients } = await supabase
          .from('admin_call_campaign_recipients')
          .select('status')
          .eq('campaign_id', callLog.campaign_id);

        if (recipients) {
          const stats = {
            called_count: recipients.filter(r => r.status !== 'queued').length,
            answered_count: recipients.filter(r => r.status === 'answered').length,
            voicemail_count: recipients.filter(r => r.status === 'voicemail').length,
            failed_count: recipients.filter(r => r.status === 'failed' || r.status === 'skipped').length,
          };

          await supabase
            .from('admin_call_campaigns')
            .update({
              ...stats,
              last_call_at: new Date().toISOString(),
            })
            .eq('id', callLog.campaign_id);
        }
      }
    }

    return new Response('OK', {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });

  } catch (error) {
    console.error('Call status webhook error:', error);
    return new Response('Error', {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });
  }
});
