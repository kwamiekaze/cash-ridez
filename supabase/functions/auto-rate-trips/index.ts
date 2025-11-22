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

    // Find trips where one party has rated but the other hasn't
    // and 24 hours have passed since the first rating
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Find trips where rider rated but driver hasn't, and 24h passed
    const { data: driverNeedsRating, error: driverError } = await supabase
      .from('ride_requests')
      .select('id, rider_id, assigned_driver_id, updated_at')
      .eq('status', 'assigned')
      .not('rider_rating', 'is', null)
      .is('driver_rating', null)
      .lt('updated_at', twentyFourHoursAgo);

    if (driverError) {
      console.error('Error fetching driver ratings:', driverError);
    } else if (driverNeedsRating && driverNeedsRating.length > 0) {
      console.log(`Found ${driverNeedsRating.length} trips where driver needs auto-rating`);
      
      for (const trip of driverNeedsRating) {
        // Give driver 5 stars and mark trip as completed
        const { error: updateError } = await supabase
          .from('ride_requests')
          .update({
            driver_rating: 5,
            driver_completed: true,
            status: 'completed'
          })
          .eq('id', trip.id);

        if (updateError) {
          console.error(`Error auto-rating driver for trip ${trip.id}:`, updateError);
        } else {
          console.log(`Auto-rated driver 5 stars for trip ${trip.id}`);
        }
      }
    }

    // Find trips where driver rated but rider hasn't, and 24h passed
    const { data: riderNeedsRating, error: riderError } = await supabase
      .from('ride_requests')
      .select('id, rider_id, assigned_driver_id, updated_at')
      .eq('status', 'assigned')
      .not('driver_rating', 'is', null)
      .is('rider_rating', null)
      .lt('updated_at', twentyFourHoursAgo);

    if (riderError) {
      console.error('Error fetching rider ratings:', riderError);
    } else if (riderNeedsRating && riderNeedsRating.length > 0) {
      console.log(`Found ${riderNeedsRating.length} trips where rider needs auto-rating`);
      
      for (const trip of riderNeedsRating) {
        // Give rider 5 stars and mark trip as completed
        const { error: updateError } = await supabase
          .from('ride_requests')
          .update({
            rider_rating: 5,
            rider_completed: true,
            status: 'completed'
          })
          .eq('id', trip.id);

        if (updateError) {
          console.error(`Error auto-rating rider for trip ${trip.id}:`, updateError);
        } else {
          console.log(`Auto-rated rider 5 stars for trip ${trip.id}`);
        }
      }
    }

    const totalAutoRated = (driverNeedsRating?.length || 0) + (riderNeedsRating?.length || 0);

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
