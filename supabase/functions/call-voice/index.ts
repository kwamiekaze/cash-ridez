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

    console.log('[call-voice] Request received:', { callId, role });

    if (!callId || !role) {
      console.error('[call-voice] Missing required parameters:', { callId, role });
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're sorry. Call information is missing. Please try again.</Say>
  <Hangup/>
</Response>`;
      return new Response(errorTwiml, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
      });
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
      console.error('[call-voice] Call record not found:', { callId, error: callError });
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're sorry. Call information not found. Please try again.</Say>
  <Hangup/>
</Response>`;
      return new Response(errorTwiml, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
      });
    }

    console.log('[call-voice] Call record found:', { rider: callRecord.rider_id, driver: callRecord.driver_id });

    // Determine the other party
    const otherPartyId = role === 'rider' ? callRecord.driver_id : callRecord.rider_id;
    console.log('[call-voice] Other party ID:', otherPartyId);

    // Fetch other party's phone number
    const { data: otherProfile, error: profileError } = await supabase
      .from('profiles')
      .select('phone_number')
      .eq('id', otherPartyId)
      .single();

    if (profileError || !otherProfile?.phone_number) {
      console.error(`[call-voice] Could not find phone number for ${role === 'rider' ? 'driver' : 'rider'}:`, profileError);
      
      // Return TwiML with helpful message instead of throwing
      const noPhoneTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're sorry. The other party's phone number is not available. Please contact them through the app.</Say>
  <Hangup/>
</Response>`;
      
      return new Response(noPhoneTwiml, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
      });
    }

    console.log('[call-voice] Other party profile found, has phone:', !!otherProfile.phone_number);

    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
    
    if (!twilioPhoneNumber) {
      console.error('[call-voice] Missing TWILIO_PHONE_NUMBER environment variable');
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're sorry. Call service is not configured. Please contact support.</Say>
  <Hangup/>
</Response>`;
      return new Response(errorTwiml, {
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
      });
    }

    // Ensure phone number is in E.164 format
    let formattedPhone = otherProfile.phone_number.trim();
    if (!formattedPhone.startsWith('+')) {
      // Assume US number if no country code
      formattedPhone = `+1${formattedPhone.replace(/\D/g, '')}`;
    }

    // Generate TwiML to dial the other party - MUST use <Number> tag inside <Dial>
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${twilioPhoneNumber}">
    <Number>${formattedPhone}</Number>
  </Dial>
</Response>`;

    console.log(`[call-voice] Routing call ${callId}: ${role} connecting to ${formattedPhone.substring(0, 5)}***`);

    return new Response(twiml, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/xml' 
      }
    });

  } catch (error) {
    console.error('[call-voice] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[call-voice] Error details:', { message: errorMessage, stack: error instanceof Error ? error.stack : undefined });
    
    // Return TwiML error message - ALWAYS return 200 with valid TwiML
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're sorry. We could not complete your call at this time. Please try again later.</Say>
  <Hangup/>
</Response>`;

    return new Response(errorTwiml, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
    });
  }
});
