import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface VerificationRequest {
  userId: string;
  userEmail: string;
  displayName: string;
  isRider: boolean;
  isDriver: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, userEmail, displayName, isRider, isDriver }: VerificationRequest = await req.json();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all admin users
    const { data: adminUsers, error: adminError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (adminError) {
      console.error("Error fetching admins:", adminError);
      throw adminError;
    }

    // Get admin emails
    const adminEmails: string[] = [];
    if (adminUsers && adminUsers.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("email")
        .in("id", adminUsers.map(u => u.user_id));

      if (profileError) {
        console.error("Error fetching admin profiles:", profileError);
      } else if (profiles) {
        adminEmails.push(...profiles.map(p => p.email).filter(Boolean));
      }
    }

    const roles = [];
    if (isRider) roles.push("Rider");
    if (isDriver) roles.push("Driver");
    const rolesText = roles.join(" & ");

    const emailHtml = `
      <h1>New ID Verification Submitted</h1>
      <p>A user has submitted their ID for verification.</p>
      
      <h2>User Details:</h2>
      <ul>
        <li><strong>Name:</strong> ${displayName}</li>
        <li><strong>Email:</strong> ${userEmail}</li>
        <li><strong>Roles:</strong> ${rolesText}</li>
        <li><strong>User ID:</strong> ${userId}</li>
      </ul>
      
      <p>Please review this verification request in the admin dashboard.</p>
      
      <p style="margin-top: 20px; color: #666; font-size: 12px;">
        This is an automated notification from Cash Ridez.
      </p>
    `;

    // Send emails to all admins
    const emailPromises = adminEmails.map(email =>
      resend.emails.send({
        from: "Cash Ridez <onboarding@resend.dev>",
        to: [email],
        subject: "New ID Verification Submitted - Cash Ridez",
        html: emailHtml,
      })
    );

    const results = await Promise.allSettled(emailPromises);
    
    const successCount = results.filter(r => r.status === "fulfilled").length;
    const failedCount = results.filter(r => r.status === "rejected").length;

    console.log(`Sent ${successCount} emails successfully, ${failedCount} failed`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        emailsSent: successCount,
        emailsFailed: failedCount 
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Error in send-verification-notification function:", error);
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
