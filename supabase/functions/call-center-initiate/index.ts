import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')!;
const ELEVENLABS_AGENT_ID = Deno.env.get('ELEVENLABS_AGENT_ID')!;
const APP_BASE_URL = Deno.env.get('APP_BASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { phoneE164, firstName, campaignId, recipientId } = await req.json();

    if (!phoneE164) {
      return new Response(JSON.stringify({ error: 'Phone number required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Initiating call to ${phoneE164} (${firstName || 'Unknown'})`);

    // Create call log entry first
    const { data: callLog, error: logError } = await supabase
      .from('admin_call_logs')
      .insert({
        admin_user_id: user.id,
        campaign_id: campaignId || null,
        campaign_recipient_id: recipientId || null,
        first_name: firstName || null,
        phone_e164: phoneE164,
        status: 'initiated',
        call_type: 'outbound',
      })
      .select()
      .single();

    if (logError) {
      console.error('Failed to create call log:', logError);
      return new Response(JSON.stringify({ error: 'Failed to create call log' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate TwiML that connects to ElevenLabs agent
    // The agent will wait for human to speak first
    const twimlUrl = `${APP_BASE_URL}/functions/v1/call-center-twiml?callLogId=${callLog.id}&firstName=${encodeURIComponent(firstName || '')}`;
    const statusCallbackUrl = `${APP_BASE_URL}/functions/v1/call-center-status`;
    const machineDetectionUrl = `${APP_BASE_URL}/functions/v1/call-center-amd`;

    // Initiate call via Twilio
    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phoneE164,
          From: TWILIO_PHONE_NUMBER,
          Url: twimlUrl,
          StatusCallback: statusCallbackUrl,
          StatusCallbackEvent: 'initiated ringing answered completed',
          StatusCallbackMethod: 'POST',
          MachineDetection: 'DetectMessageEnd',
          AsyncAmd: 'true',
          AsyncAmdStatusCallback: machineDetectionUrl,
          AsyncAmdStatusCallbackMethod: 'POST',
          Record: 'true',
          RecordingStatusCallback: `${APP_BASE_URL}/functions/v1/call-center-recording`,
          RecordingStatusCallbackEvent: 'completed',
        }),
      }
    );

    const twilioData = await twilioResponse.json();

    if (!twilioResponse.ok) {
      console.error('Twilio call failed:', twilioData);
      
      // Update call log with error
      await supabase
        .from('admin_call_logs')
        .update({
          status: 'failed',
          error_code: twilioData.code?.toString(),
          error_message: twilioData.message,
        })
        .eq('id', callLog.id);

      return new Response(JSON.stringify({ 
        error: 'Failed to initiate call',
        details: twilioData.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update call log with Twilio SID
    await supabase
      .from('admin_call_logs')
      .update({
        twilio_call_sid: twilioData.sid,
        status: 'initiated',
      })
      .eq('id', callLog.id);

    // Update campaign recipient if applicable
    if (recipientId) {
      await supabase
        .from('admin_call_campaign_recipients')
        .update({
          status: 'calling',
          twilio_call_sid: twilioData.sid,
          call_started_at: new Date().toISOString(),
          attempt_count: supabase.rpc('increment', { x: 1 }),
          last_attempt_at: new Date().toISOString(),
        })
        .eq('id', recipientId);
    }

    console.log(`Call initiated successfully: ${twilioData.sid}`);

    return new Response(JSON.stringify({
      success: true,
      callSid: twilioData.sid,
      callLogId: callLog.id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Call center initiate error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
