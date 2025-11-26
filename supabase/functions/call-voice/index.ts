// ============================================================================
// TWILIO VOICE WEBHOOK FOR CASHRIDEZ
// ============================================================================
//
// This Supabase Edge Function handles Twilio voice webhook callbacks.
// When a call is answered, Twilio calls this endpoint to get TwiML instructions.
//
// WEBHOOK URL (configured automatically by call-start):
//   https://wnajjqsqmrpwyffbpgsj.supabase.co/functions/v1/call-voice
//
// PARAMETERS:
//   - callId: The call record ID from our database
//   - role: 'rider' or 'driver' (who answered first)
//
// FLOW:
//   1. Twilio calls this when first party answers
//   2. Function looks up call details from database
//   3. Returns TwiML to dial the other party
//   4. Call is bridged between rider and driver
//
// AUTHENTICATION: No JWT required (verify_jwt = false) - Twilio webhook
//
// IMPORTANT:
//   - Always returns valid TwiML XML (even on errors)
//   - Returns HTTP 200 to prevent Twilio errors
//   - Uses fallback TwiML if lookup fails
//
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const fallbackTwiML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're sorry. We could not complete your CashRidez call. Goodbye.</Say>
  <Hangup/>
</Response>`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse query parameters
    const url = new URL(req.url);
    const callId = url.searchParams.get('callId');
    const role = url.searchParams.get('role');

    console.log(`[call-voice] Call webhook received - callId: ${callId}, role: ${role || 'not specified'}`);
    if (!callId) {
      console.error('Missing callId parameter');
      return new Response(fallbackTwiML, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
      });
    }

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Look up the call record
    const { data: call, error: callError } = await supabase
      .from('calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (callError || !call) {
      console.error('Call not found:', callError);
      return new Response(fallbackTwiML, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
      });
    }

    // Fetch both profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, phone_number')
      .in('id', [call.rider_id, call.driver_id]);

    if (profilesError || !profiles || profiles.length !== 2) {
      console.error('Failed to fetch profiles:', profilesError);
      return new Response(fallbackTwiML, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
      });
    }

    // Find rider and driver profiles
    const riderProfile = profiles.find(p => p.id === call.rider_id);
    const driverProfile = profiles.find(p => p.id === call.driver_id);

    if (!riderProfile?.phone_number || !driverProfile?.phone_number) {
      console.error('Missing phone numbers');
      return new Response(fallbackTwiML, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
      });
    }

    // Determine which party to dial based on role parameter
    let otherPartyPhone: string;
    
    if (role === 'rider') {
      // Rider answered, so dial the driver
      otherPartyPhone = driverProfile.phone_number;
    } else if (role === 'driver') {
      // Driver answered, so dial the rider
      otherPartyPhone = riderProfile.phone_number;
    } else {
      // No role specified, assume initiator answered, dial the other party
      if (call.initiated_by_user_id === call.rider_id) {
        otherPartyPhone = driverProfile.phone_number;
      } else {
        otherPartyPhone = riderProfile.phone_number;
      }
    }

    // Get Twilio phone number for caller ID
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
    
    if (!twilioPhoneNumber) {
      console.error('Missing TWILIO_PHONE_NUMBER environment variable');
      return new Response(fallbackTwiML, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
      });
    }

    // Build TwiML to dial the other party
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${twilioPhoneNumber}">
    <Number>${otherPartyPhone}</Number>
  </Dial>
</Response>`;

    console.log(`[call-voice] Bridging call ${callId}: connecting to other party (role determined: ${role || 'inferred'})`);

    return new Response(twiml, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
    });

  } catch (error) {
    console.error('Error in call-voice handler:', error);
    return new Response(fallbackTwiML, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
    });
  }
});
