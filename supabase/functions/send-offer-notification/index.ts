import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OfferNotificationRequest {
  recipientEmail: string;
  recipientName: string;
  actionType: "accepted" | "countered";
  senderName: string;
  offerAmount: number;
  tripId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      recipientEmail, 
      recipientName, 
      actionType, 
      senderName, 
      offerAmount,
      tripId 
    }: OfferNotificationRequest = await req.json();

    console.log(`Sending ${actionType} notification to ${recipientEmail}`);

    const subject = actionType === "accepted" 
      ? "Your Offer Was Accepted!"
      : `Your Offer Was Countered by ${senderName}`;

    const htmlContent = actionType === "accepted"
      ? `
        <h1>Great News!</h1>
        <p>Hi ${recipientName},</p>
        <p><strong>${senderName}</strong> has accepted your offer of <strong>$${offerAmount}</strong>!</p>
        <p>Please visit your CashRidez dashboard to view the trip details and contact information:</p>
        <p><a href="https://cashridez.com/trip/${tripId}" style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">View Trip Details</a></p>
        <p>You can now see the contact details for ${senderName} in the trip chat.</p>
        <p>Best regards,<br>CashRidez Team</p>
      `
      : `
        <h1>Your Offer Has Been Countered</h1>
        <p>Hi ${recipientName},</p>
        <p><strong>${senderName}</strong> has countered your offer with a new amount of <strong>$${offerAmount}</strong>.</p>
        <p>Please visit your CashRidez dashboard to review and respond to the counter offer:</p>
        <p><a href="https://cashridez.com/trip/${tripId}" style="display: inline-block; padding: 12px 24px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">View Counter Offer</a></p>
        <p>Best regards,<br>CashRidez Team</p>
      `;

    const emailResponse = await resend.emails.send({
      from: "CashRidez <noreply@cashridez.com>",
      to: [recipientEmail],
      subject: subject,
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
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
