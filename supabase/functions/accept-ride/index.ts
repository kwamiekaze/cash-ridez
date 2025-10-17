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

    const { rideId, etaMinutes } = await req.json();

    // Validate inputs
    if (!rideId || !etaMinutes) {
      throw new Error('Missing required fields: rideId, etaMinutes');
    }

    if (etaMinutes < 1 || etaMinutes > 240) {
      throw new Error('ETA must be between 1 and 240 minutes');
    }

    console.log(`Driver ${user.id} attempting to accept ride ${rideId} with ETA ${etaMinutes}`);

    // Use a transaction-like approach with RPC call
    const { data, error } = await supabase.rpc('accept_ride_atomic', {
      p_ride_id: rideId,
      p_driver_id: user.id,
      p_eta_minutes: etaMinutes,
    });

    if (error) {
      console.error('Error accepting ride:', error);
      throw error;
    }

    if (!data || data.success === false) {
      throw new Error(data?.message || 'Failed to accept ride');
    }

    console.log(`Ride ${rideId} successfully accepted by driver ${user.id}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Ride accepted successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in accept-ride function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'An error occurred',
        success: false 
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
