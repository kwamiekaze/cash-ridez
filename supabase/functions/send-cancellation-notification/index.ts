import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "npm:resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY") as string);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CancellationNotificationRequest {
  cancelledBy: string;
  cancelledByName: string;
  otherUserEmail: string;
  otherUserName: string;
  cancellationReason: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupTime: string;
  rideId: string;
  adminEmails: string[];
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      cancelledBy,
      cancelledByName,
      otherUserEmail,
      otherUserName,
      cancellationReason,
      pickupAddress,
      dropoffAddress,
      pickupTime,
      rideId,
      adminEmails,
    }: CancellationNotificationRequest = await req.json();

    console.log("Sending cancellation notifications for ride:", rideId);

    const pickupDate = new Date(pickupTime).toLocaleString();

    // Email to the other user
    const userEmailHtml = `
      <h1>Trip Cancelled</h1>
      <p>Hello ${otherUserName},</p>
      <p>Unfortunately, your trip has been cancelled by ${cancelledByName}.</p>
      
      <h2>Trip Details:</h2>
      <p><strong>Pickup:</strong> ${pickupAddress}</p>
      <p><strong>Dropoff:</strong> ${dropoffAddress}</p>
      <p><strong>Scheduled Time:</strong> ${pickupDate}</p>
      
      <h2>Cancellation Reason:</h2>
      <p>${cancellationReason}</p>
      
      <p>We apologize for the inconvenience. You can find alternative trips on your CashRidez dashboard.</p>
      
      <p>Best regards,<br>The CashRidez Team</p>
    `;

    // Email to admins
    const adminEmailHtml = `
      <h1>Trip Cancellation Report</h1>
      <p><strong>Cancelled by:</strong> ${cancelledByName} (${cancelledBy})</p>
      <p><strong>Other user:</strong> ${otherUserName}</p>
      <p><strong>Ride ID:</strong> ${rideId}</p>
      
      <h2>Trip Details:</h2>
      <p><strong>Pickup:</strong> ${pickupAddress}</p>
      <p><strong>Dropoff:</strong> ${dropoffAddress}</p>
      <p><strong>Scheduled Time:</strong> ${pickupDate}</p>
      
      <h2>Cancellation Reason:</h2>
      <p>${cancellationReason}</p>
      
      <hr>
      <p><em>This is an automated notification from CashRidez.</em></p>
    `;

    // Send emails in parallel
    const emailPromises = [];

    // Email to other user
    emailPromises.push(
      resend.emails.send({
        from: "CashRidez <onboarding@resend.dev>",
        to: [otherUserEmail],
        subject: "Trip Cancelled",
        html: userEmailHtml,
      })
    );

    // Emails to admins (including the static email)
    const allAdminEmails = [...new Set([...adminEmails, "cashridezconnect@gmail.com"])];
    
    for (const adminEmail of allAdminEmails) {
      emailPromises.push(
        resend.emails.send({
          from: "CashRidez Notifications <onboarding@resend.dev>",
          to: [adminEmail],
          subject: `Trip Cancellation Report - ${rideId.substring(0, 8)}`,
          html: adminEmailHtml,
        })
      );
    }

    const results = await Promise.all(emailPromises);
    console.log("Cancellation notification emails sent:", results);

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending cancellation notifications:", error);
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
