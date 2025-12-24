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

// CRITICAL: Use male voice (Polly.Matthew) for fallback - NEVER female voice
const fallbackTwiML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">We're sorry. We could not complete your Cash Ridez call. Goodbye.</Say>
  <Hangup/>
</Response>`;

// Helper function to extract phone number from text
function extractPhoneNumber(text: string): string | null {
  if (!text) return null;
  
  // Remove common formatting characters
  const cleaned = text.replace(/[\s\-\(\)\.]/g, '');
  
  // Match various phone number formats:
  // - 10 digits: 1234567890
  // - 11 digits with country code: 11234567890 or +11234567890
  const phoneRegex = /(\+?1)?(\d{10})/;
  const match = cleaned.match(phoneRegex);
  
  if (match && match[2]) {
    // Return in E.164 format: +1XXXXXXXXXX
    return `+1${match[2]}`;
  }
  
  return null;
}

// Helper function to extract contact info from rider_note
function extractContactFromRiderNote(riderNote: string | null): string | null {
  if (!riderNote) return null;
  
  // rider_note format: "Trip Details: ... | Contact: ... | Emergency: ..."
  const contactMatch = riderNote.match(/Contact:\s*([^|]+)/i);
  if (contactMatch && contactMatch[1]) {
    const contactText = contactMatch[1].trim();
    return extractPhoneNumber(contactText);
  }
  
  return null;
}

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

    // Look up the call record and associated trip
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

    // Fetch trip details to get rider_note for fallback contact
    const { data: trip, error: tripError } = await supabase
      .from('ride_requests')
      .select('rider_note')
      .eq('id', call.trip_id)
      .single();

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

    // Get rider phone number - fallback to contact info from rider_note if profile phone is missing
    let riderPhoneNumber = riderProfile?.phone_number?.trim() || '';
    if (!riderPhoneNumber && trip?.rider_note) {
      console.log('[call-voice] Rider has no profile phone, attempting to extract from rider_note');
      const extractedPhone = extractContactFromRiderNote(trip.rider_note);
      if (extractedPhone) {
        console.log('[call-voice] Successfully extracted phone from rider_note');
        riderPhoneNumber = extractedPhone;
      }
    }

    // Get driver phone number from profile
    const driverPhoneNumber = driverProfile?.phone_number?.trim() || '';

    if (!riderPhoneNumber || !driverPhoneNumber) {
      console.error('Missing phone numbers after fallback attempts');
      return new Response(fallbackTwiML, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
      });
    }

    // Determine which party to dial based on role parameter
    let otherPartyPhone: string;
    
    if (role === 'rider') {
      // Rider answered, so dial the driver
      otherPartyPhone = driverPhoneNumber;
    } else if (role === 'driver') {
      // Driver answered, so dial the rider
      otherPartyPhone = riderPhoneNumber;
    } else {
      // No role specified, assume initiator answered, dial the other party
      if (call.initiated_by_user_id === call.rider_id) {
        otherPartyPhone = driverPhoneNumber;
      } else {
        otherPartyPhone = riderPhoneNumber;
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
