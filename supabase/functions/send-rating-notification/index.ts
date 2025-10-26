import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RatingNotificationRequest {
  ratedUserId: string;
  raterName: string;
  rating: number;
  rideId: string;
  ratingType: 'rider' | 'driver';
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ratedUserId, raterName, rating, rideId, ratingType }: RatingNotificationRequest = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the rated user's profile
    const { data: ratedUser, error: profileError } = await supabase
      .from("profiles")
      .select("email, display_name")
      .eq("id", ratedUserId)
      .single();

    if (profileError) {
      console.error("Error fetching rated user profile:", profileError);
      throw profileError;
    }

    // Check if the rated user has already rated the rater
    const { data: rideData } = await supabase
      .from("ride_requests")
      .select("rider_id, assigned_driver_id, rider_rating, driver_rating")
      .eq("id", rideId)
      .single();

    let hasRatedBack = false;
    if (rideData) {
      if (ratingType === 'rider' && ratedUserId === rideData.rider_id) {
        // User was rated as rider, check if they rated the driver back
        hasRatedBack = !!rideData.driver_rating;
      } else if (ratingType === 'driver' && ratedUserId === rideData.assigned_driver_id) {
        // User was rated as driver, check if they rated the rider back
        hasRatedBack = !!rideData.rider_rating;
      }
    }

    // Create notification
    await supabase.from('notifications').insert({
      user_id: ratedUserId,
      type: 'rating_received',
      title: 'You Received a Rating',
      message: `${raterName} rated you ${rating} stars as a ${ratingType}`,
      link: `/trip/${rideId}`,
      related_ride_id: rideId
    });

    // Send email
    const starIcons = "⭐".repeat(rating);
    const ratingPrompt = hasRatedBack 
      ? `<p>Thank you for rating ${raterName}!</p>`
      : `<p style="background-color: #fef3c7; padding: 16px; border-radius: 8px; border-left: 4px solid #f59e0b;"><strong>Haven't rated ${raterName} yet?</strong> Please take a moment to rate your experience with them!</p>`;
    
    const emailHtml = `
      <h1>You Received a Rating</h1>
      <p><strong>${raterName}</strong> has rated you as a ${ratingType}:</p>
      <p style="font-size: 24px; color: #f59e0b;">${starIcons} (${rating}/5)</p>
      ${ratingPrompt}
      <p><a href="https://cashridez.com/trip/${rideId}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 16px;">${hasRatedBack ? 'View Trip Details' : 'View Trip & Rate'}</a></p>
      <p style="margin-top: 20px; color: #666; font-size: 12px;">This is an automated notification from CashRidez.</p>
    `;

    if (ratedUser.email) {
      await resend.emails.send({
        from: "CashRidez <noreply@cashridez.com>",
        to: [ratedUser.email],
        subject: `You received a ${rating}-star rating from ${raterName}`,
        html: emailHtml,
      });
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Error in send-rating-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
