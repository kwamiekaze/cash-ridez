import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const callId = url.searchParams.get('callId');
    const role = url.searchParams.get('role');

    if (!callId || !role) {
      throw new Error('Missing callId or role');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch call record
    const { data: callRecord, error: callError } = await supabase
      .from('calls')
      .select('id, rider_id, driver_id')
      .eq('id', callId)
      .single();

    if (callError || !callRecord) {
      throw new Error('Call record not found');
    }

    // Determine the other party
    const otherPartyId = role === 'rider' ? callRecord.driver_id : callRecord.rider_id;

    // Fetch other party's phone number
    const { data: otherProfile, error: profileError } = await supabase
      .from('profiles')
      .select('phone_number')
      .eq('id', otherPartyId)
      .single();

    if (profileError || !otherProfile?.phone_number) {
      throw new Error('Other party phone number not found');
    }

    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    // Generate TwiML to dial the other party
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${twilioPhoneNumber}">${otherProfile.phone_number}</Dial>
</Response>`;

    console.log(`Voice routing for call ${callId}: ${role} connecting to other party`);

    return new Response(twiml, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/xml' 
      }
    });

  } catch (error) {
    console.error('Error in call-voice:', error);
    
    // Return TwiML error message
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, we could not connect your call. Please try again later.</Say>
  <Hangup/>
</Response>`;

    return new Response(errorTwiml, {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
    });
  }
});
