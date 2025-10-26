import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RideAcceptedNotificationRequest {
  riderEmail: string;
  riderName: string;
  riderPhone: string;
  driverEmail: string;
  driverName: string;
  driverPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupTime: string;
  etaMinutes: number;
  rideId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      riderEmail,
      riderName,
      riderPhone,
      driverEmail,
      driverName,
      driverPhone,
      pickupAddress,
      dropoffAddress,
      pickupTime,
      etaMinutes,
      rideId,
    }: RideAcceptedNotificationRequest = await req.json();

    console.log("Sending ride accepted notifications for ride:", rideId);

    // Email to rider
    const riderHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #10b981;">Your Ride Has Been Accepted! 🚗</h1>
        <p>Hi ${riderName},</p>
        <p>Great news! Your ride request has been accepted by <strong>${driverName}</strong>.</p>
        
        <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; margin: 24px 0;">
          <h3 style="margin-top: 0; color: #065f46;">Trip Details</h3>
          <p style="margin: 8px 0;"><strong>Pickup:</strong> ${pickupAddress}</p>
          <p style="margin: 8px 0;"><strong>Dropoff:</strong> ${dropoffAddress}</p>
          <p style="margin: 8px 0;"><strong>Pickup Time:</strong> ${new Date(pickupTime).toLocaleString()}</p>
          <p style="margin: 8px 0;"><strong>Estimated Arrival:</strong> ${etaMinutes} minutes</p>
        </div>

        <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 24px 0;">
          <h3 style="margin-top: 0; color: #1e40af;">Driver Contact Information</h3>
          <p style="margin: 8px 0;"><strong>Name:</strong> ${driverName}</p>
          <p style="margin: 8px 0;"><strong>Phone:</strong> ${driverPhone || "Not provided"}</p>
          <p style="margin: 8px 0;"><strong>Email:</strong> ${driverEmail}</p>
        </div>

        <p>You can now message your driver directly through the CashRidez app to coordinate pickup details.</p>
        
        <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 24px 0;">
          <h3 style="margin-top: 0; color: #991b1b;">⚠️ Safety Reminder</h3>
          <ul style="color: #991b1b; margin: 8px 0;">
            <li>Only communicate through the CashRidez platform initially</li>
            <li>Verify the driver's identity before getting in the vehicle</li>
            <li>Never send money in advance - payments should be made in person after the trip</li>
            <li>Share your trip details with a friend or family member</li>
          </ul>
        </div>

        <p style="margin-top: 32px; color: #6b7280;">Safe travels!<br>The CashRidez Team</p>
      </div>
    `;

    // Email to driver
    const driverHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #10b981;">Ride Confirmation 🚗</h1>
        <p>Hi ${driverName},</p>
        <p>You've successfully accepted a ride request from <strong>${riderName}</strong>.</p>
        
        <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; margin: 24px 0;">
          <h3 style="margin-top: 0; color: #065f46;">Trip Details</h3>
          <p style="margin: 8px 0;"><strong>Pickup:</strong> ${pickupAddress}</p>
          <p style="margin: 8px 0;"><strong>Dropoff:</strong> ${dropoffAddress}</p>
          <p style="margin: 8px 0;"><strong>Pickup Time:</strong> ${new Date(pickupTime).toLocaleString()}</p>
          <p style="margin: 8px 0;"><strong>Your ETA:</strong> ${etaMinutes} minutes</p>
        </div>

        <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 24px 0;">
          <h3 style="margin-top: 0; color: #1e40af;">Rider Contact Information</h3>
          <p style="margin: 8px 0;"><strong>Name:</strong> ${riderName}</p>
          <p style="margin: 8px 0;"><strong>Phone:</strong> ${riderPhone || "Not provided"}</p>
          <p style="margin: 8px 0;"><strong>Email:</strong> ${riderEmail}</p>
        </div>

        <p>You can now message the rider directly through the CashRidez app to coordinate pickup details.</p>
        
        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0;">
          <h3 style="margin-top: 0; color: #92400e;">💡 Driver Tips</h3>
          <ul style="color: #92400e; margin: 8px 0;">
            <li>Contact the rider to confirm pickup location and timing</li>
            <li>Arrive on time and communicate any delays promptly</li>
            <li>Ensure payment is collected in cash after the trip is complete</li>
            <li>Drive safely and follow all traffic laws</li>
          </ul>
        </div>

        <p style="margin-top: 32px; color: #6b7280;">Safe travels!<br>The CashRidez Team</p>
      </div>
    `;

    // Send both emails
    const [riderEmailResponse, driverEmailResponse] = await Promise.all([
      resend.emails.send({
        from: "CashRidez <noreply@cashridez.com>",
        to: [riderEmail],
        subject: "🚗 Your Ride Has Been Accepted!",
        html: riderHtml,
      }),
      resend.emails.send({
        from: "CashRidez <noreply@cashridez.com>",
        to: [driverEmail],
        subject: "🚗 Ride Confirmation - Contact Information Shared",
        html: driverHtml,
      }),
    ]);

    console.log("Ride accepted notifications sent successfully");

    return new Response(
      JSON.stringify({ 
        success: true, 
        riderEmailResponse, 
        driverEmailResponse 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error sending ride accepted notifications:", error);
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
