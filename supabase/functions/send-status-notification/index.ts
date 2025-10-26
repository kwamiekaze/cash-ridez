import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StatusNotificationRequest {
  userEmail: string;
  displayName: string;
  status: "approved" | "rejected";
  adminDisplayName?: string;
  reason?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userEmail, displayName, status, adminDisplayName, reason }: StatusNotificationRequest = await req.json();

    console.log("Sending status notification to:", userEmail, "Status:", status);

    const subject = status === "approved" 
      ? "✅ Your Cash Ridez Account Has Been Verified!" 
      : "⚠️ Cash Ridez Verification Update";

    const adminInfo = adminDisplayName ? `<p style="margin: 8px 0 0 0; color: #374151;">Reviewed by: <strong>${adminDisplayName}</strong></p>` : "";
    const reasonBlock = status === "rejected" && reason
      ? `<div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 24px 0;">
           <h3 style="margin-top: 0; color: #991b1b;">Reason for Rejection</h3>
           <p style="color: #991b1b; white-space: pre-wrap;">${reason}</p>
         </div>`
      : "";

    const html = status === "approved"
      ? `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #10b981;">Welcome to Cash Ridez, ${displayName}!</h1>
          <p>Great news! Your account has been verified and you now have full access to all Cash Ridez features.</p>
          ${adminInfo}
          <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; margin: 24px 0;">
            <h3 style="margin-top: 0; color: #065f46;">What's Next?</h3>
            <ul style="color: #047857;">
              <li>Post trip requests to find travel companions</li>
              <li>Respond to ride requests in your area</li>
              <li>Build your community reputation through ratings</li>
            </ul>
          </div>
          <p>Ready to get started? Log in to your account and begin connecting with the Cash Ridez community!</p>
          <p style="margin-top: 32px; color: #6b7280;">Best regards,<br>The Cash Ridez Team</p>
        </div>
      `
      : `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #ef4444;">Verification Status Update</h1>
          <p>Hello ${displayName},</p>
          <p>We've reviewed your verification submission, but unfortunately we were unable to verify your account at this time.</p>
          ${adminInfo}
          ${reasonBlock}
          <p><strong>You can resubmit your verification</strong> by logging into your account and uploading a new ID image.</p>
          <p style="color: #6b7280;">Please ensure your ID photo is clear, well-lit, and shows all required information.</p>
          <p style="margin-top: 32px; color: #6b7280;">If you have questions, please contact our support team.<br><br>Best regards,<br>The Cash Ridez Team</p>
        </div>
      `;

    const emailResponse = await resend.emails.send({
      from: "Cash Ridez <onboarding@resend.dev>",
      to: [userEmail],
      subject,
      html,
    });

    console.log("Status notification sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailResponse }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error sending status notification:", error);
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
