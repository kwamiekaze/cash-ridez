import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SupportRequest {
  fullName: string;
  email: string;
  message: string;
  userId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fullName, email, message, userId }: SupportRequest = await req.json();

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

    // Get admin emails from profiles
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

    // Always add these specific emails
    const specificEmails = ["cashridezconnect@gmail.com", "kwamiekaze@gmail.com"];
    const allRecipients = [...new Set([...adminEmails, ...specificEmails])];

    console.log(`Sending support notification to ${allRecipients.length} recipients`);

    const emailHtml = `
      <h1>New Support Request</h1>
      <p>A user has submitted a support request.</p>
      <h2>Contact Details:</h2>
      <ul>
        <li><strong>Name:</strong> ${fullName}</li>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>User ID:</strong> ${userId}</li>
      </ul>
      <h2>Message:</h2>
      <p style="padding: 15px; background-color: #f5f5f5; border-left: 4px solid #4CAF50; margin: 20px 0;">
        ${message.replace(/\n/g, '<br>')}
      </p>
      <p>Please respond to the user at: <a href="mailto:${email}">${email}</a></p>
      <p style="margin-top: 20px; color: #666; font-size: 12px;">This is an automated notification from Cash Ridez.</p>
    `;

    // Send emails to all recipients
    const emailPromises = allRecipients.map(recipientEmail =>
      resend.emails.send({
        from: "Cash Ridez Support <onboarding@resend.dev>",
        to: [recipientEmail],
        replyTo: email,
        subject: `Support Request from ${fullName} - Cash Ridez`,
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
        emailsFailed: failedCount,
        recipients: allRecipients.length
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
    console.error("Error in send-support-notification function:", error);
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
