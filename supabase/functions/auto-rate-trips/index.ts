import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting auto-rating check...');

    // 24 hours ago threshold
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Find trips where rider rated but driver hasn't, and 24h passed since updated_at
    // updated_at gets set when rider_rating is added, so 24h from that is correct
    const { data: driverNeedsRating, error: driverError } = await supabase
      .from('ride_requests')
      .select('id, rider_id, assigned_driver_id, updated_at, rider_rating')
      .in('status', ['assigned', 'completed'])
      .not('rider_rating', 'is', null)
      .is('driver_rating', null)
      .lt('updated_at', twentyFourHoursAgo);

    if (driverError) {
      console.error('Error fetching trips needing driver auto-rating:', driverError);
    } else if (driverNeedsRating && driverNeedsRating.length > 0) {
      console.log(`Found ${driverNeedsRating.length} trips where driver needs auto-rating`);
      
      for (const trip of driverNeedsRating) {
        console.log(`Processing trip ${trip.id}: rider rated ${trip.rider_rating} stars, driver hasn't rated yet`);
        
        // Driver hasn't rated the rider - auto-give 5 stars on behalf of driver
        // driver_rating = rating the driver gives to the rider
        const { error: updateError } = await supabase
          .from('ride_requests')
          .update({
            driver_rating: 5,
            driver_completed: true,
            status: 'completed'
          })
          .eq('id', trip.id);

        if (updateError) {
          console.error(`Error auto-rating for trip ${trip.id}:`, updateError);
        } else {
          console.log(`Auto-rated: driver->rider 5 stars for trip ${trip.id}`);
          
          // Update the rider's profile rating average (driver_rating affects rider's rating)
          const { data: riderProfile } = await supabase
            .from('profiles')
            .select('rider_rating_avg, rider_rating_count')
            .eq('id', trip.rider_id)
            .single();
          
          if (riderProfile) {
            const currentAvg = riderProfile.rider_rating_avg || 0;
            const currentCount = riderProfile.rider_rating_count || 0;
            const newCount = currentCount + 1;
            const newAvg = ((currentAvg * currentCount) + 5) / newCount;
            
            await supabase
              .from('profiles')
              .update({
                rider_rating_avg: parseFloat(newAvg.toFixed(2)),
                rider_rating_count: newCount
              })
              .eq('id', trip.rider_id);
            
            console.log(`Updated rider ${trip.rider_id} rating: ${newAvg.toFixed(2)} (${newCount} ratings)`);
          }
        }
      }
    }

    // Find trips where driver rated but rider hasn't, and 24h passed since updated_at
    const { data: riderNeedsRating, error: riderError } = await supabase
      .from('ride_requests')
      .select('id, rider_id, assigned_driver_id, updated_at, driver_rating')
      .in('status', ['assigned', 'completed'])
      .not('driver_rating', 'is', null)
      .is('rider_rating', null)
      .lt('updated_at', twentyFourHoursAgo);

    if (riderError) {
      console.error('Error fetching trips needing rider auto-rating:', riderError);
    } else if (riderNeedsRating && riderNeedsRating.length > 0) {
      console.log(`Found ${riderNeedsRating.length} trips where rider needs auto-rating`);
      
      for (const trip of riderNeedsRating) {
        console.log(`Processing trip ${trip.id}: driver rated ${trip.driver_rating} stars, rider hasn't rated yet`);
        
        // Rider hasn't rated the driver - auto-give 5 stars on behalf of rider
        // rider_rating = rating the rider gives to the driver
        const { error: updateError } = await supabase
          .from('ride_requests')
          .update({
            rider_rating: 5,
            rider_completed: true,
            status: 'completed'
          })
          .eq('id', trip.id);

        if (updateError) {
          console.error(`Error auto-rating for trip ${trip.id}:`, updateError);
        } else {
          console.log(`Auto-rated: rider->driver 5 stars for trip ${trip.id}`);
          
          // Update the driver's profile rating average (rider_rating affects driver's rating)
          if (trip.assigned_driver_id) {
            const { data: driverProfile } = await supabase
              .from('profiles')
              .select('driver_rating_avg, driver_rating_count')
              .eq('id', trip.assigned_driver_id)
              .single();
            
            if (driverProfile) {
              const currentAvg = driverProfile.driver_rating_avg || 0;
              const currentCount = driverProfile.driver_rating_count || 0;
              const newCount = currentCount + 1;
              const newAvg = ((currentAvg * currentCount) + 5) / newCount;
              
              await supabase
                .from('profiles')
                .update({
                  driver_rating_avg: parseFloat(newAvg.toFixed(2)),
                  driver_rating_count: newCount
                })
                .eq('id', trip.assigned_driver_id);
              
              console.log(`Updated driver ${trip.assigned_driver_id} rating: ${newAvg.toFixed(2)} (${newCount} ratings)`);
            }
          }
        }
      }
    }

    const totalAutoRated = (driverNeedsRating?.length || 0) + (riderNeedsRating?.length || 0);

    console.log(`Auto-rating complete. Processed ${totalAutoRated} trips.`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Auto-rating complete. Processed ${totalAutoRated} trips.`,
        driverAutoRated: driverNeedsRating?.length || 0,
        riderAutoRated: riderNeedsRating?.length || 0,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error in auto-rate-trips:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
