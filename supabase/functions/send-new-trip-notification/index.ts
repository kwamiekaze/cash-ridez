import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import {
  NEARBY_RADIUS_MI,
  getZipDistance,
  isNearbyZip,
  isSameScf,
} from '../_shared/geo.ts';

const DEBOUNCE_MINUTES = 30;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Caller must be signed in AND be the rider on the ride they name.
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const token = authHeader.replace('Bearer ', '').trim();
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );
    const { data: claims, error: authError } = await authClient.auth.getClaims(token);
    const callerId = claims?.claims?.sub;
    if (authError || !callerId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const ride_request_id = typeof body?.ride_request_id === 'string' ? body.ride_request_id : '';
    if (!ride_request_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Client-supplied rider id / ZIP are ignored: the ride row is authoritative.
    const { data: ride, error: rideError } = await supabaseClient
      .from('ride_requests')
      .select('id, rider_id, pickup_zip')
      .eq('id', ride_request_id)
      .maybeSingle();

    if (rideError || !ride) {
      return new Response(
        JSON.stringify({ error: 'Ride not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (ride.rider_id !== callerId) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rider_id = ride.rider_id;
    const pickup_zip = ride.pickup_zip;
    if (!pickup_zip) {
      return new Response(
        JSON.stringify({ error: 'Ride has no pickup ZIP' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🚕 Processing new trip notification: ride_request_id=${ride_request_id}`);


    // Get rider profile
    const { data: riderProfile, error: riderError } = await supabaseClient
      .from('profiles')
      .select('full_name, photo_url')
      .eq('id', rider_id)
      .single();

    if (riderError || !riderProfile) {
      console.error('Error fetching rider profile:', riderError);
      return new Response(
        JSON.stringify({ error: 'Rider profile not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get available drivers with their current ZIP
    const { data: driverStatuses, error: driversError } = await supabaseClient
      .from('driver_status')
      .select('user_id, current_zip, state')
      .eq('state', 'available')
      .not('current_zip', 'is', null);

    if (driversError) {
      console.error('Error fetching drivers:', driversError);
      return new Response(
        JSON.stringify({ error: driversError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!driverStatuses || driverStatuses.length === 0) {
      console.log(`📭 No available drivers found`);
      return new Response(
        JSON.stringify({ success: true, message: 'No drivers to notify' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`👥 Found ${driverStatuses.length} available drivers`);

    // Filter drivers within 25 miles or same SCF
    const nearbyDrivers = driverStatuses.filter(driver => {
      if (!driver.current_zip) return false;

      const distance = getZipDistance(driver.current_zip, pickup_zip);
      const withinRadius = distance !== null && distance <= NEARBY_RADIUS_MI;
      const scfMatch = isSameScf(driver.current_zip, pickup_zip);
      const nearby = isNearbyZip(driver.current_zip, pickup_zip);

      console.info('Driver check:', {
        driverZip: driver.current_zip,
        pickupZip: pickup_zip,
        distance,
        within25Miles: withinRadius,
        scfMatch,
        decision: nearby
      });

      return nearby;
    });

    console.log(`📍 Found ${nearbyDrivers.length} nearby drivers (within 25mi or same SCF)`);

    // Check for recent notifications to implement debouncing
    const debounceThreshold = new Date(Date.now() - DEBOUNCE_MINUTES * 60 * 1000).toISOString();
    
    const notificationPromises = nearbyDrivers.map(async (driver) => {
      // Check driver's notification preferences
      const { data: driverProfile } = await supabaseClient
        .from('profiles')
        .select('notification_preferences')
        .eq('id', driver.user_id)
        .single();

      const notifPrefs = driverProfile?.notification_preferences as Record<string, any>;
      const newOffersEnabled = notifPrefs?.new_offers ?? false;

      if (!newOffersEnabled) {
        console.log(`Skipping notification for driver ${driver.user_id} - new_offers preference disabled`);
        return null;
      }

      // Check if we've sent a notification to this driver about this trip recently
      const { data: recentNotifications } = await supabaseClient
        .from('notifications')
        .select('id')
        .eq('user_id', driver.user_id)
        .eq('related_ride_id', ride_request_id)
        .eq('type', 'new_trip')
        .gte('created_at', debounceThreshold)
        .limit(1);

      if (recentNotifications && recentNotifications.length > 0) {
        console.log(`Skipping notification for driver ${driver.user_id} - already notified within ${DEBOUNCE_MINUTES} minutes`);
        return null;
      }

      // Calculate distance for notification
      const distance = getZipDistance(driver.current_zip, pickup_zip);
      const distanceText = distance ? `~${Math.round(distance)} mi away` : 'nearby';

      // Create notification
      let notifError: any = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const { error } = await supabaseClient
          .from('notifications')
          .insert({
            user_id: driver.user_id,
            related_user_id: rider_id,
            related_ride_id: ride_request_id,
            type: 'new_trip',
            title: 'New Trip Request Near You',
            message: `${riderProfile.full_name} posted a trip request ${distanceText} from you.`,
            link: `/trip/${ride_request_id}`,
          });
        if (!error) {
          console.log(`Sent notification to driver ${driver.user_id} (attempt ${attempt})`);
          notifError = null;
          break;
        }
        notifError = error;
        console.warn(`Retrying notification for driver ${driver.user_id} after error:`, error);
      }

      if (notifError) {
        console.error(`Error creating notification for driver ${driver.user_id}:`, notifError);
        return null;
      }

      return driver.user_id;
    });

    const results = await Promise.all(notificationPromises);
    const successCount = results.filter(r => r !== null).length;
    
    console.log(`✅ Successfully sent ${successCount} notifications out of ${nearbyDrivers.length} nearby drivers`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        notifications_sent: successCount,
        drivers_checked: nearbyDrivers.length,
        total_available_drivers: driverStatuses.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in send-new-trip-notification:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
