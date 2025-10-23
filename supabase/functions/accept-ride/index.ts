import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { rideId, etaMinutes, driverId, skipEtaCheck, skipActiveRideCheck } = await req.json();

    // Validate inputs
    if (!rideId) {
      throw new Error('Missing required field: rideId');
    }

    if (!skipEtaCheck && (!etaMinutes || etaMinutes < 1 || etaMinutes > 240)) {
      throw new Error('ETA must be between 1 and 240 minutes');
    }

    // Use provided driverId or default to current user
    const finalDriverId = driverId || user.id;

    // Check subscription status and completed trips
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_active, completed_trips_count')
      .eq('id', finalDriverId)
      .single();

    if (!profile?.subscription_active && profile?.completed_trips_count >= 3) {
      throw new Error('You have reached your free trip limit. Please subscribe to continue accepting rides.');
    }

    console.log(`Driver ${finalDriverId} attempting to accept ride ${rideId} with ETA ${etaMinutes || 0}, skipActiveRideCheck: ${skipActiveRideCheck || false}`);

    // Use a transaction-like approach with RPC call
    const { data, error } = await supabase.rpc('accept_ride_atomic', {
      p_ride_id: rideId,
      p_driver_id: finalDriverId,
      p_eta_minutes: etaMinutes || 0,
      p_skip_active_check: skipActiveRideCheck || false,
    });

    if (error) {
      console.error('Error accepting ride:', error);
      throw error;
    }

    if (!data || data.success === false) {
      throw new Error(data?.message || 'Failed to accept ride');
    }

    console.log(`Ride ${rideId} successfully accepted by driver ${user.id}`);

    // Send email notifications with contact information
    try {
      // Fetch ride and user details for email
      const { data: rideData, error: rideError } = await supabase
        .from('ride_requests')
        .select('*, rider:profiles!ride_requests_rider_id_fkey(display_name, full_name, email, phone_number)')
        .eq('id', rideId)
        .single();

      const { data: driverData, error: driverError } = await supabase
        .from('profiles')
        .select('display_name, full_name, email, phone_number')
        .eq('id', finalDriverId)
        .single();

      if (!rideError && !driverError && rideData && driverData && rideData.rider) {
        await supabase.functions.invoke('send-ride-accepted-notification', {
          body: {
            riderEmail: rideData.rider.email,
            riderName: rideData.rider.full_name || rideData.rider.display_name || 'Rider',
            riderPhone: rideData.rider.phone_number || '',
            driverEmail: driverData.email,
            driverName: driverData.full_name || driverData.display_name || 'Driver',
            driverPhone: driverData.phone_number || '',
            pickupAddress: rideData.pickup_address,
            dropoffAddress: rideData.dropoff_address,
            pickupTime: rideData.pickup_time,
            etaMinutes: etaMinutes,
            rideId: rideId,
          },
        });
        console.log('Email notifications sent successfully');
      }
    } catch (emailError) {
      console.error('Error sending notification emails:', emailError);
      // Don't fail the whole operation if email fails
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Ride accepted successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in accept-ride function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false 
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
