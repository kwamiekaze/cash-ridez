import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * End Call endpoint - Hangs up an active call using Twilio API
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { callSid, callLogId } = await req.json();

    if (!callSid && !callLogId) {
      return new Response(
        JSON.stringify({ success: false, error: 'callSid or callLogId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      throw new Error('Twilio credentials not configured');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let twilioCallSid = callSid;

    // If we have callLogId, look up the Twilio SID
    if (!twilioCallSid && callLogId) {
      const { data: callLog } = await supabase
        .from('admin_call_logs')
        .select('twilio_call_sid')
        .eq('id', callLogId)
        .single();
      
      if (callLog?.twilio_call_sid) {
        twilioCallSid = callLog.twilio_call_sid;
      }
    }

    if (!twilioCallSid) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not find call SID' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Ending call: ${twilioCallSid}`);

    // Call Twilio API to update call status to 'completed'
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    
    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${twilioCallSid}.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'Status=completed',
      }
    );

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();
      console.error('Twilio end call error:', errorText);
      
      // If call is already ended, that's okay
      if (errorText.includes('already completed') || twilioResponse.status === 404) {
        // Update DB anyway
        await supabase
          .from('admin_call_logs')
          .update({ 
            status: 'completed',
            call_ended_at: new Date().toISOString(),
          })
          .eq('twilio_call_sid', twilioCallSid);
        
        return new Response(
          JSON.stringify({ success: true, message: 'Call already ended' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Twilio API error: ${errorText}`);
    }

    // Update our database
    await supabase
      .from('admin_call_logs')
      .update({ 
        status: 'completed',
        call_ended_at: new Date().toISOString(),
      })
      .eq('twilio_call_sid', twilioCallSid);

    console.log(`Call ${twilioCallSid} ended successfully`);

    return new Response(
      JSON.stringify({ success: true, message: 'Call ended' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('End call error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
