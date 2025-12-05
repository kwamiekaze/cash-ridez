// ============================================================================
// TWILIO CALL INITIATOR FOR CASHRIDEZ
// ============================================================================
//
// This Supabase Edge Function initiates masked calls between riders and drivers.
//
// ENDPOINT URL:
//   https://wnajjqsqmrpwyffbpgsj.supabase.co/functions/v1/call-start
//
// ERROR CODES returned to frontend:
//   - NO_USER_PHONE: Current user has no phone
//   - NO_RIDER_PHONE: Rider has no phone
//   - NO_DRIVER_PHONE: Driver has no phone
//   - INVALID_PHONE_FORMAT: Phone format is invalid
//   - TRIP_NOT_ASSIGNED: Trip must be assigned
//   - NOT_PARTICIPANT: User is not trip participant
//   - TRIP_NOT_FOUND: Trip doesn't exist
//   - UNAUTHORIZED: Missing auth
//   - SERVER_CONFIG_ERROR: Missing env vars
//   - TWILIO_ERROR: Twilio API failure
//
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import twilio from "npm:twilio@5.3.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to create structured error response
function errorResponse(code: string, message: string, status: number = 400) {
  console.error(`[call-start] Error: ${code} - ${message}`);
  return new Response(
    JSON.stringify({ success: false, code, error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

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

// Validate phone number format
function isValidPhoneNumber(phone: string | null): boolean {
  if (!phone) return false;
  // E.164 format for US: +1 followed by 10 digits
  return /^\+1\d{10}$/.test(phone);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[call-start] Function invoked');
    
    // Check authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('UNAUTHORIZED', 'Please log in to use in-app calling.', 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return errorResponse('UNAUTHORIZED', 'Please log in to use in-app calling.', 401);
    }

    console.log('[call-start] User authenticated:', user.id);

    // Parse request body
    let trip_id: string;
    try {
      const body = await req.json();
      trip_id = body.trip_id;
    } catch {
      return errorResponse('INVALID_REQUEST', 'Invalid request format.', 400);
    }
    
    if (!trip_id) {
      return errorResponse('INVALID_REQUEST', 'Trip ID is required.', 400);
    }

    console.log('[call-start] Trip ID:', trip_id);

    // Fetch trip details including rider_note for fallback contact info
    const { data: trip, error: tripError } = await supabase
      .from('ride_requests')
      .select('id, status, rider_id, assigned_driver_id, rider_note')
      .eq('id', trip_id)
      .single();

    if (tripError || !trip) {
      return errorResponse('TRIP_NOT_FOUND', 'Trip not found. It may have been cancelled.', 404);
    }

    console.log('[call-start] Trip found:', { status: trip.status, rider: trip.rider_id, driver: trip.assigned_driver_id });

    // Validate trip status
    if (trip.status !== 'assigned') {
      return errorResponse('TRIP_NOT_ASSIGNED', 'This trip must be assigned before you can make a call.', 400);
    }

    // Check if user is participant
    if (user.id !== trip.rider_id && user.id !== trip.assigned_driver_id) {
      return errorResponse('NOT_PARTICIPANT', 'You are not a participant in this trip.', 403);
    }

    // Fetch both profiles with phone numbers
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, phone_number')
      .in('id', [trip.rider_id, trip.assigned_driver_id]);

    if (profilesError || !profiles || profiles.length !== 2) {
      console.error('[call-start] Profile fetch error:', profilesError);
      return errorResponse('SERVER_CONFIG_ERROR', 'Failed to fetch participant profiles. Please try again.', 500);
    }

    const riderProfile = profiles.find(p => p.id === trip.rider_id);
    const driverProfile = profiles.find(p => p.id === trip.assigned_driver_id);

    // Get rider phone number - fallback to contact info from rider_note if profile phone is missing
    let riderPhoneRaw = riderProfile?.phone_number?.trim() || '';
    if (!riderPhoneRaw && trip.rider_note) {
      console.log('[call-start] Rider has no profile phone, attempting to extract from rider_note');
      const extractedPhone = extractContactFromRiderNote(trip.rider_note);
      if (extractedPhone) {
        console.log('[call-start] Successfully extracted phone from rider_note');
        riderPhoneRaw = extractedPhone;
      }
    }

    // Format and validate phone numbers
    const riderPhone = extractPhoneNumber(riderPhoneRaw) || riderPhoneRaw;
    const driverPhone = extractPhoneNumber(driverProfile?.phone_number || '') || driverProfile?.phone_number?.trim() || '';

    // Detailed phone validation with specific error codes
    const riderHasValidPhone = isValidPhoneNumber(riderPhone);
    const driverHasValidPhone = isValidPhoneNumber(driverPhone);

    console.log('[call-start] Phone validation:', { 
      riderPhone: riderPhone ? '***' + riderPhone.slice(-4) : 'none',
      driverPhone: driverPhone ? '***' + driverPhone.slice(-4) : 'none',
      riderValid: riderHasValidPhone,
      driverValid: driverHasValidPhone
    });

    // Return specific error for which phone is missing
    if (!riderHasValidPhone && !driverHasValidPhone) {
      return errorResponse(
        'NO_USER_PHONE',
        'Both participants need valid phone numbers. Please update your profiles.',
        400
      );
    }
    
    if (!riderHasValidPhone) {
      // If current user is rider, tell them to add their phone
      if (user.id === trip.rider_id) {
        return errorResponse('NO_USER_PHONE', 'Please add your carrier phone number to your profile to use in-app calling.', 400);
      }
      // Otherwise tell driver the rider needs to add phone
      return errorResponse('NO_RIDER_PHONE', 'The rider hasn\'t provided a valid phone number. Please ask them to update their contact info.', 400);
    }
    
    if (!driverHasValidPhone) {
      // If current user is driver, tell them to add their phone
      if (user.id === trip.assigned_driver_id) {
        return errorResponse('NO_USER_PHONE', 'Please add your carrier phone number to your profile to use in-app calling.', 400);
      }
      // Otherwise tell rider the driver needs to add phone
      return errorResponse('NO_DRIVER_PHONE', 'The driver hasn\'t added a phone number to their profile yet.', 400);
    }

    // Determine initiator and recipient phone numbers
    const initiatorPhone = user.id === trip.rider_id ? riderPhone : driverPhone;
    const initiatorRole = user.id === trip.rider_id ? 'rider' : 'driver';

    // Create call record
    const { data: callRecord, error: callError } = await supabase
      .from('calls')
      .insert({
        trip_id: trip.id,
        rider_id: trip.rider_id,
        driver_id: trip.assigned_driver_id,
        initiated_by_user_id: user.id,
        status: 'initiated'
      })
      .select()
      .single();

    if (callError || !callRecord) {
      console.error('[call-start] Failed to create call record:', callError);
      return errorResponse('SERVER_CONFIG_ERROR', 'Failed to create call record. Please try again.', 500);
    }

    // Check environment variables
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!twilioAccountSid || !twilioAuthToken || !supabaseUrl || !twilioPhoneNumber) {
      console.error('[call-start] Missing environment variables');
      return errorResponse('SERVER_CONFIG_ERROR', 'Server configuration error. Please contact support.', 500);
    }

    // Initialize Twilio client
    const twilioClient = twilio(twilioAccountSid, twilioAuthToken);
    const functionsBaseUrl = `${supabaseUrl}/functions/v1`;

    console.log('[call-start] Initiating call to:', initiatorPhone.slice(0, 4) + '***');
    
    try {
      // Initiate call to the initiator
      const call = await twilioClient.calls.create({
        to: initiatorPhone,
        from: twilioPhoneNumber,
        url: `${functionsBaseUrl}/call-voice?callId=${callRecord.id}&role=${initiatorRole}`,
        statusCallback: `${functionsBaseUrl}/call-status?callId=${callRecord.id}`,
        statusCallbackMethod: 'POST',
        method: 'POST'
      });

      console.log('[call-start] Call created successfully, SID:', call.sid);

      // Update call record with Twilio SID
      const sidField = initiatorRole === 'rider' ? 'twilio_call_sid_rider' : 'twilio_call_sid_driver';
      await supabase
        .from('calls')
        .update({ [sidField]: call.sid })
        .eq('id', callRecord.id);

      return new Response(
        JSON.stringify({
          success: true,
          call_id: callRecord.id,
          message: 'Call initiated. Answer the incoming call from our CashRidez number.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (twilioError: any) {
      console.error('[call-start] Twilio error:', twilioError);
      
      // Parse Twilio error for more specific messages
      const twilioCode = twilioError?.code;
      const twilioMessage = twilioError?.message || '';
      
      // Map common Twilio errors
      if (twilioCode === 21211 || twilioMessage.includes('invalid phone')) {
        return errorResponse('INVALID_PHONE_FORMAT', 'The phone number format is invalid. Please update your profile with a valid US number.', 400);
      }
      if (twilioCode === 21214 || twilioMessage.includes('not a valid')) {
        return errorResponse('INVALID_DESTINATION_NUMBER', 'The phone number is not valid. Please check the number and try again.', 400);
      }
      if (twilioCode === 21215) {
        return errorResponse('TWILIO_UNAVAILABLE', 'Cannot reach this phone number. Please verify it\'s correct.', 400);
      }
      if (twilioCode === 20429 || twilioMessage.includes('rate')) {
        return errorResponse('RATE_LIMITED', 'Too many calls. Please wait a few minutes before trying again.', 429);
      }
      
      return errorResponse('TWILIO_ERROR', 'Unable to start the call right now. Please try again later.', 500);
    }

  } catch (error) {
    console.error('[call-start] Unexpected error:', error);
    return errorResponse('UNKNOWN', 'An unexpected error occurred. Please try again or contact support.', 500);
  }
});
