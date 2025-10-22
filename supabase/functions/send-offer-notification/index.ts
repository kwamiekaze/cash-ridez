import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OfferNotificationRequest {
  recipientEmail?: string;
  recipientName?: string;
  recipientProfileId?: string; // If provided, we'll look up email/name server-side
  actionType: "accepted" | "countered" | "new_offer" | "rejected";
  senderName: string;
  offerAmount: number;
  tripId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as OfferNotificationRequest;
    let { recipientEmail, recipientName, recipientProfileId, actionType, senderName, offerAmount, tripId } = payload;

    // If we weren't given an email, try to resolve it using a privileged lookup
    if (!recipientEmail && recipientProfileId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, serviceKey);

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', recipientProfileId)
        .single();

      if (error) throw error;
      recipientEmail = profile?.email || recipientEmail;
      recipientName = profile?.full_name || recipientName || 'User';
    }

    if (!recipientEmail) {
      throw new Error('recipientEmail missing and could not be resolved');
    }

    console.log(`Sending ${actionType} notification to ${recipientEmail}`);

    let subject = '';
    let htmlContent = '';

    if (actionType === 'accepted') {
      subject = 'Your Offer Was Accepted!';
      htmlContent = `
        <h1>Great News!</h1>
        <p>Hi ${recipientName || 'there'},</p>
        <p><strong>${senderName}</strong> has accepted your offer of <strong>$${offerAmount}</strong>!</p>
        <p>Please visit your CashRidez dashboard to view the trip details and contact information:</p>
        <p><a href="https://cashridez.com/trip/${tripId}" style="display: inline-block; padding: 12px 24px; background-color: #22c55e; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">View Trip Details</a></p>
        <p>You can now see contact details in the trip chat.</p>
        <p>Best regards,<br>CashRidez Team</p>
      `;
    } else if (actionType === 'rejected') {
      subject = 'Your Offer Was Declined';
      htmlContent = `
        <h1>Offer Status Update</h1>
        <p>Hi ${recipientName || 'there'},</p>
        <p><strong>${senderName}</strong> has declined your offer of <strong>$${offerAmount}</strong>.</p>
        <p>Don't worry! There are other trips available that you can browse:</p>
        <p><a href="https://cashridez.com/trips" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">Browse Available Trips</a></p>
        <p>Best regards,<br>CashRidez Team</p>
      `;
    } else if (actionType === 'countered') {
      subject = `Your Offer Was Countered by ${senderName}`;
      htmlContent = `
        <h1>Your Offer Has Been Countered</h1>
        <p>Hi ${recipientName || 'there'},</p>
        <p><strong>${senderName}</strong> has countered your offer with a new amount of <strong>$${offerAmount}</strong>.</p>
        <p>Please review and respond to the counter offer:</p>
        <p><a href="https://cashridez.com/trip/${tripId}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">View Counter Offer</a></p>
        <p>Best regards,<br>CashRidez Team</p>
      `;
    } else {
      // new_offer
      subject = 'New Offer Received for Your Trip';
      htmlContent = `
        <h1>New Offer Received</h1>
        <p>Hi ${recipientName || 'there'},</p>
        <p>You received a new offer of <strong>$${offerAmount}</strong> from <strong>${senderName}</strong>.</p>
        <p>Open your trip to accept or counter:</p>
        <p><a href="https://cashridez.com/trip/${tripId}" style="display: inline-block; padding: 12px 24px; background-color: #0ea5e9; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">Review Offer</a></p>
        <p>Best regards,<br>CashRidez Team</p>
      `;
    }

    const emailResponse = await resend.emails.send({
      from: "CashRidez <noreply@cashridez.com>",
      to: [recipientEmail],
      subject,
      html: htmlContent,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-offer-notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

