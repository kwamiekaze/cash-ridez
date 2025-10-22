import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ZIP centroids for distance calculation (subset for GA area)
const ZIP_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  '30117': { lat: 34.0758, lng: -84.6177 },
  '30118': { lat: 34.1518, lng: -84.5844 },
  '30120': { lat: 34.0151, lng: -84.5522 },
  '30121': { lat: 34.1681, lng: -84.8299 },
  '30141': { lat: 33.9965, lng: -84.7844 },
  '30144': { lat: 33.9526, lng: -84.5499 },
  '30152': { lat: 33.9526, lng: -84.5180 },
  '30168': { lat: 33.9166, lng: -84.6133 },
  '30180': { lat: 33.6857, lng: -84.7941 },
  '30101': { lat: 33.9765, lng: -84.2010 },
  '30102': { lat: 33.9332, lng: -84.6349 },
  '30127': { lat: 33.9512, lng: -84.3355 },
  '30060': { lat: 33.8823, lng: -84.5155 },
  '30062': { lat: 33.9651, lng: -84.5194 },
  '30064': { lat: 33.9526, lng: -84.4833 },
  '30066': { lat: 33.9651, lng: -84.5499 },
  '30067': { lat: 33.9526, lng: -84.5180 },
  '30068': { lat: 33.9332, lng: -84.4833 },
  '30080': { lat: 33.8823, lng: -84.5155 },
  '30082': { lat: 33.8823, lng: -84.4833 },
  '30303': { lat: 33.7490, lng: -84.3880 },
  '30305': { lat: 33.8415, lng: -84.3880 },
  '30306': { lat: 33.7796, lng: -84.3538 },
  '30307': { lat: 33.7676, lng: -84.3399 },
  '30308': { lat: 33.7718, lng: -84.3851 },
  '30309': { lat: 33.7835, lng: -84.3851 },
  '30310': { lat: 33.7323, lng: -84.4147 },
  '30311': { lat: 33.7323, lng: -84.4466 },
  '30312': { lat: 33.7490, lng: -84.3732 },
  '30313': { lat: 33.7568, lng: -84.3969 },
  '30314': { lat: 33.7568, lng: -84.4230 },
  '30315': { lat: 33.7068, lng: -84.3969 },
  '30316': { lat: 33.7323, lng: -84.3538 },
  '30317': { lat: 33.7490, lng: -84.3399 },
  '30318': { lat: 33.7796, lng: -84.4230 },
  '30319': { lat: 33.8568, lng: -84.3399 },
  '30324': { lat: 33.8154, lng: -84.3538 },
  '30326': { lat: 33.8485, lng: -84.3616 },
  '30327': { lat: 33.8568, lng: -84.4147 },
  '30328': { lat: 33.9320, lng: -84.3644 },
  '30329': { lat: 33.8235, lng: -84.3260 },
  '30331': { lat: 33.7068, lng: -84.5016 },
  '30332': { lat: 33.7796, lng: -84.3969 },
  '30336': { lat: 33.7235, lng: -84.5016 },
  '30337': { lat: 33.6568, lng: -84.4466 },
  '30338': { lat: 33.9320, lng: -84.2910 },
  '30339': { lat: 33.8823, lng: -84.4655 },
  '30340': { lat: 33.9154, lng: -84.2693 },
  '30341': { lat: 33.8823, lng: -84.2910 },
  '30342': { lat: 33.8823, lng: -84.3644 },
  '30344': { lat: 33.6901, lng: -84.4466 },
  '30345': { lat: 33.8568, lng: -84.2910 },
  '30346': { lat: 33.9154, lng: -84.3399 },
  '30349': { lat: 33.6234, lng: -84.4912 },
  '30350': { lat: 33.9651, lng: -84.3399 },
};

const NEARBY_RADIUS_MI = 25;
const DEBOUNCE_MINUTES = 30;

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getZipDistance(zip1: string, zip2: string): number | null {
  const centroid1 = ZIP_CENTROIDS[zip1];
  const centroid2 = ZIP_CENTROIDS[zip2];
  if (!centroid1 || !centroid2) return null;
  return haversineDistance(centroid1.lat, centroid1.lng, centroid2.lat, centroid2.lng);
}

function isSameScf(zip1: string, zip2: string): boolean {
  return zip1.slice(0, 3) === zip2.slice(0, 3);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { driver_id, current_zip, state } = await req.json();

    console.log(`Processing driver availability: ${driver_id}, state: ${state}, zip: ${current_zip}`);

    // Only send notifications when driver becomes available
    if (state !== 'available' || !current_zip) {
      return new Response(
        JSON.stringify({ success: true, message: 'No notifications needed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get driver profile with photo and name
    const { data: driverProfile, error: driverError } = await supabaseClient
      .from('profiles')
      .select('full_name, photo_url')
      .eq('id', driver_id)
      .single();

    if (driverError || !driverProfile) {
      console.error('Error fetching driver profile:', driverError);
      return new Response(
        JSON.stringify({ error: 'Driver profile not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get riders who want notifications and have a profile_zip
    const { data: riders, error: ridersError } = await supabaseClient
      .from('profiles')
      .select('id, profile_zip, full_name')
      .eq('notify_new_driver', true)
      .not('profile_zip', 'is', null);

    if (ridersError) {
      console.error('Error fetching riders:', ridersError);
      return new Response(
        JSON.stringify({ error: ridersError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!riders || riders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No riders to notify' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter riders within 25 miles or same SCF
    const nearbyRiders = riders.filter(rider => {
      if (!rider.profile_zip) return false;
      
      const distance = getZipDistance(rider.profile_zip, current_zip);
      
      // If distance is calculable, use it
      if (distance !== null && distance <= NEARBY_RADIUS_MI) {
        return true;
      }
      
      // Fallback to SCF (3-digit) matching
      if (isSameScf(rider.profile_zip, current_zip)) {
        return true;
      }
      
      return false;
    });

    console.log(`Found ${nearbyRiders.length} nearby riders to potentially notify`);

    // Check for recent notifications to implement debouncing
    const debounceThreshold = new Date(Date.now() - DEBOUNCE_MINUTES * 60 * 1000).toISOString();
    
    const notificationPromises = nearbyRiders.map(async (rider) => {
      // Check if we've sent a notification to this rider about this driver recently
      const { data: recentNotifications } = await supabaseClient
        .from('notifications')
        .select('id')
        .eq('user_id', rider.id)
        .eq('related_user_id', driver_id)
        .eq('type', 'driver_available')
        .gte('created_at', debounceThreshold)
        .limit(1);

      if (recentNotifications && recentNotifications.length > 0) {
        console.log(`Skipping notification for rider ${rider.id} - already notified within ${DEBOUNCE_MINUTES} minutes`);
        return null;
      }

      // Calculate distance for notification
      const distance = getZipDistance(rider.profile_zip, current_zip);
      const distanceText = distance ? `~${Math.round(distance)} mi away` : 'nearby';

      // Create notification
      const { error: notifError } = await supabaseClient
        .from('notifications')
        .insert({
          user_id: rider.id,
          related_user_id: driver_id,
          type: 'driver_available',
          title: 'Driver Available Near You',
          message: `${driverProfile.full_name} is now available near you (ZIP ${current_zip}, ${distanceText}).`,
          link: `/profile/${driver_id}`,
        });

      if (notifError) {
        console.error(`Error creating notification for rider ${rider.id}:`, notifError);
        return null;
      }

      console.log(`Sent notification to rider ${rider.id}`);
      return rider.id;
    });

    const results = await Promise.all(notificationPromises);
    const successCount = results.filter(r => r !== null).length;

    return new Response(
      JSON.stringify({ 
        success: true, 
        notifications_sent: successCount,
        riders_checked: nearbyRiders.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-driver-available-notification:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
