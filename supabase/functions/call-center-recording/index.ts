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
    const recordingSid = formData.get('RecordingSid') as string;
    const recordingUrl = formData.get('RecordingUrl') as string;
    const recordingDuration = formData.get('RecordingDuration') as string;
    const recordingStatus = formData.get('RecordingStatus') as string;

    console.log(`Recording callback for ${callSid}: ${recordingStatus}, URL: ${recordingUrl}`);

    if (recordingStatus !== 'completed') {
      return new Response('OK', {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Update call log with recording info
    const { error } = await supabase
      .from('admin_call_logs')
      .update({
        recording_url: recordingUrl,
        recording_sid: recordingSid,
        recording_duration_seconds: parseInt(recordingDuration, 10) || null,
      })
      .eq('twilio_call_sid', callSid);

    if (error) {
      console.error('Failed to update call log with recording:', error);
    } else {
      console.log(`Updated call ${callSid} with recording ${recordingSid}`);
    }

    // Also update campaign recipient if applicable
    const { data: callLog } = await supabase
      .from('admin_call_logs')
      .select('campaign_recipient_id')
      .eq('twilio_call_sid', callSid)
      .single();

    if (callLog?.campaign_recipient_id) {
      await supabase
        .from('admin_call_campaign_recipients')
        .update({
          recording_url: recordingUrl,
          recording_duration_seconds: parseInt(recordingDuration, 10) || null,
        })
        .eq('id', callLog.campaign_recipient_id);
    }

    return new Response('OK', {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });

  } catch (error) {
    console.error('Recording webhook error:', error);
    return new Response('Error', {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });
  }
});
