// ============================================================================
// TWILIO CALL INITIATOR FOR CASHRIDEZ
// ============================================================================
//
// This Supabase Edge Function initiates masked calls between riders and drivers.
//
// ENDPOINT URL:
//   https://wnajjqsqmrpwyffbpgsj.supabase.co/functions/v1/call-start
//
// REQUIRED SECRETS (already configured in Lovable Cloud):
//   - TWILIO_ACCOUNT_SID: Your Twilio account SID
//   - TWILIO_AUTH_TOKEN: Your Twilio auth token
//   - TWILIO_PHONE_NUMBER: Your Twilio phone number (caller ID)
//   - APP_BASE_URL: https://cash-ridez.lovable.app
//
// FLOW:
//   1. Frontend calls this function with trip_id
//   2. Creates call record in database
//   3. Initiates Twilio call to the initiator
//   4. Twilio calls call-voice endpoint to bridge the call
//   5. Status updates sent to call-status endpoint
//
// AUTHENTICATION: Requires valid Supabase JWT (verify_jwt = true)
//
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import twilio from "npm:twilio@5.3.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[call-start] Function invoked');
    console.log('[call-start] Environment check - Twilio SID available:', !!Deno.env.get('TWILIO_ACCOUNT_SID'));
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[call-start] Missing authorization header');
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('[call-start] Auth error:', userError);
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[call-start] User authenticated:', user.id);

    const { trip_id } = await req.json();
    console.log('[call-start] Trip ID:', trip_id);
    if (!trip_id) {
      console.error('[call-start] Missing trip_id');
      return new Response(
        JSON.stringify({ success: false, error: 'trip_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch trip details
    console.log('[call-start] Fetching trip details');
    const { data: trip, error: tripError } = await supabase
      .from('ride_requests')
      .select('id, status, rider_id, assigned_driver_id')
      .eq('id', trip_id)
      .single();

    if (tripError || !trip) {
      console.error('[call-start] Trip not found:', tripError);
      return new Response(
        JSON.stringify({ success: false, error: 'Trip not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[call-start] Trip found:', { status: trip.status, rider: trip.rider_id, driver: trip.assigned_driver_id });

    // Validate trip status
    if (trip.status !== 'assigned') {
      console.error('[call-start] Invalid trip status:', trip.status);
      return new Response(
        JSON.stringify({ success: false, error: 'Trip must be assigned to make a call.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is participant
    if (user.id !== trip.rider_id && user.id !== trip.assigned_driver_id) {
      console.error('[call-start] User is not a participant:', user.id);
      return new Response(
        JSON.stringify({ success: false, error: 'You are not a participant in this trip' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch both profiles with phone numbers
    console.log('[call-start] Fetching participant profiles');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, phone_number')
      .in('id', [trip.rider_id, trip.assigned_driver_id]);

    if (profilesError || !profiles || profiles.length !== 2) {
      console.error('[call-start] Profile fetch error:', profilesError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch participant profiles' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[call-start] Profiles fetched:', profiles.map(p => ({ id: p.id, hasPhone: !!p.phone_number })));

    const riderProfile = profiles.find(p => p.id === trip.rider_id);
    const driverProfile = profiles.find(p => p.id === trip.assigned_driver_id);

    // Validate BOTH participants have phone numbers
    const riderHasPhone = riderProfile?.phone_number != null && riderProfile.phone_number.trim() !== '';
    const driverHasPhone = driverProfile?.phone_number != null && driverProfile.phone_number.trim() !== '';

    if (!riderHasPhone || !driverHasPhone) {
      console.error('[call-start] Phone number validation failed:', {
        riderHasPhone,
        driverHasPhone
      });
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Rider or driver is missing a phone number.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine initiator and recipient
    const initiatorPhone = user.id === trip.rider_id ? riderProfile.phone_number : driverProfile.phone_number;
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
      throw new Error('Failed to create call record');
    }

    // Check environment variables
    console.log('[call-start] Checking environment variables');
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!twilioAccountSid || !twilioAuthToken || !supabaseUrl || !twilioPhoneNumber) {
      console.error('[call-start] Missing environment variables:', {
        hasTwilioSid: !!twilioAccountSid,
        hasTwilioToken: !!twilioAuthToken,
        hasSupabaseUrl: !!supabaseUrl,
        hasTwilioPhone: !!twilioPhoneNumber
      });
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error. Please contact support.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[call-start] Environment variables OK');

    // Initialize Twilio client
    console.log('[call-start] Initializing Twilio client');
    const twilioClient = twilio(twilioAccountSid, twilioAuthToken);

    // Use Supabase edge function URLs for callbacks
    const functionsBaseUrl = `${supabaseUrl}/functions/v1`;

    console.log('[call-start] Initiating call to:', initiatorPhone);
    
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
      console.log('[call-start] Call bridging initiated - waiting for participants to answer');

      // Update call record with Twilio SID
      const sidField = initiatorRole === 'rider' ? 'twilio_call_sid_rider' : 'twilio_call_sid_driver';
      await supabase
        .from('calls')
        .update({ [sidField]: call.sid })
        .eq('id', callRecord.id);

      console.log(`Call initiated: ${callRecord.id}, Twilio SID: ${call.sid}`);

      return new Response(
        JSON.stringify({
          success: true,
          call_id: callRecord.id,
          message: 'Call initiated. Answer the incoming call from our CashRidez number.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (twilioError) {
      console.error('[call-start] Twilio error:', twilioError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Unable to start the call right now. Please try again later.' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('[call-start] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('[call-start] Error details:', { message: errorMessage, stack: error instanceof Error ? error.stack : undefined });
    return new Response(
      JSON.stringify({ success: false, error: `Failed to initiate call: ${errorMessage}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
