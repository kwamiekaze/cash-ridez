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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
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
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { trip_id } = await req.json();
    if (!trip_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'trip_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch trip details
    const { data: trip, error: tripError } = await supabase
      .from('ride_requests')
      .select('id, status, rider_id, assigned_driver_id')
      .eq('id', trip_id)
      .single();

    if (tripError || !trip) {
      return new Response(
        JSON.stringify({ success: false, error: 'Trip not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate trip status
    if (trip.status !== 'assigned') {
      return new Response(
        JSON.stringify({ success: false, error: 'Trip must be in assigned status to make a call' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is participant
    if (user.id !== trip.rider_id && user.id !== trip.assigned_driver_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'You are not a participant in this trip' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch both profiles with phone numbers
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, phone_number, is_verified')
      .in('id', [trip.rider_id, trip.assigned_driver_id]);

    if (profilesError || !profiles || profiles.length !== 2) {
      console.error('Profile fetch error:', profilesError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch participant profiles' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const riderProfile = profiles.find(p => p.id === trip.rider_id);
    const driverProfile = profiles.find(p => p.id === trip.assigned_driver_id);

    if (!riderProfile?.phone_number || !driverProfile?.phone_number) {
      const missingRole = !riderProfile?.phone_number ? 'rider' : 'driver';
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Both participants must have a verified phone number to place a call. The ${missingRole} needs to add their phone number in their profile.` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!riderProfile.is_verified || !driverProfile.is_verified) {
      const unverifiedRole = !riderProfile.is_verified ? 'rider' : 'driver';
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Both participants must be verified to place a call. The ${unverifiedRole} needs to complete verification.` 
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
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!twilioAccountSid || !twilioAuthToken || !supabaseUrl || !twilioPhoneNumber) {
      console.error('Missing environment variables:', {
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

    // Initialize Twilio client
    const twilioClient = twilio(twilioAccountSid, twilioAuthToken);

    // Use Supabase edge function URLs for callbacks
    const functionsBaseUrl = `${supabaseUrl}/functions/v1`;

    // Initiate call to the initiator
    const call = await twilioClient.calls.create({
      to: initiatorPhone,
      from: twilioPhoneNumber,
      url: `${functionsBaseUrl}/call-voice?callId=${callRecord.id}&role=${initiatorRole}`,
      statusCallback: `${functionsBaseUrl}/call-status?callId=${callRecord.id}`,
      statusCallbackMethod: 'POST',
      method: 'POST'
    });

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

  } catch (error) {
    console.error('Unexpected error in call-start:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ success: false, error: `Failed to initiate call: ${errorMessage}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
