import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface QueuedEmail {
  id: string;
  user_id: string;
  user_email: string;
  first_name: string | null;
  is_driver: boolean;
  is_rider: boolean;
}

// Determine primary role: Driver takes priority, fallback to Rider
function getPrimaryRole(isDriver: boolean, isRider: boolean): "driver" | "rider" {
  if (isDriver) return "driver";
  return "rider"; // Fallback to rider if neither or only rider
}

function getDriverEmailHtml(firstName: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #000 0%, #1a1a1a 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #facc15; margin: 0; font-size: 24px;">🚗 You're Verified!</h1>
    <p style="color: #fff; margin: 10px 0 0 0; font-size: 16px;">Your Driver Profile Is Now Active on CashRidez</p>
  </div>

  <p style="font-size: 16px;">Hi ${firstName},</p>

  <p style="font-size: 16px;">Congratulations — your CashRidez driver account has been officially verified!</p>

  <p style="font-size: 16px;">You're now ready to connect with riders nearby and start earning real cash immediately.</p>

  <hr style="border: none; border-top: 2px solid #facc15; margin: 30px 0;">

  <h2 style="color: #000; font-size: 18px;">🚀 Step 1 — Update Your Approximate Location</h2>
  <p style="font-size: 16px;">Your driver pin helps riders close to you discover you quickly.</p>
  <p style="font-size: 16px; background: #f5f5f5; padding: 12px; border-radius: 8px; border-left: 4px solid #facc15;">
    Go to: <strong>Map → Update My Pin</strong>
  </p>
  <p style="font-size: 16px;">This takes only a moment and instantly increases your chances of receiving trip requests.</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <h2 style="color: #000; font-size: 18px;">🧩 Step 2 — Complete Your Driver Profile</h2>
  <p style="font-size: 16px;">A strong driver profile builds trust and helps riders choose you.</p>
  <p style="font-size: 16px;">Please make sure you've added:</p>
  <ul style="font-size: 16px;">
    <li>Profile photo</li>
    <li>Vehicle details</li>
    <li>Any optional info you'd like to showcase</li>
  </ul>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <h2 style="color: #000; font-size: 18px;">💰 Why This Matters</h2>
  <p style="font-size: 16px;">CashRidez is built on real people, real visibility, and real cash. Drivers who update their location and complete their profiles get significantly more rider connections.</p>

  <p style="font-size: 16px;">Welcome to the community — excited to see you on the road.</p>

  <div style="background: #000; color: #facc15; padding: 20px; border-radius: 8px; margin-top: 30px; text-align: center;">
    <p style="margin: 0; font-size: 18px; font-weight: bold;">Let's earn. 🚗💵</p>
    <p style="margin: 10px 0 0 0; color: #fff; font-size: 14px;">— CashRidez Team<br>CashRidez Connect LLC</p>
  </div>
</body>
</html>
  `;
}

function getRiderEmailHtml(firstName: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #000 0%, #1a1a1a 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #facc15; margin: 0; font-size: 24px;">🎉 You're Verified!</h1>
    <p style="color: #fff; margin: 10px 0 0 0; font-size: 16px;">Welcome to CashRidez!</p>
  </div>

  <p style="font-size: 16px;">Hi ${firstName},</p>

  <p style="font-size: 16px;">Great news — your CashRidez rider profile is now verified!</p>

  <p style="font-size: 16px;">You can now connect with drivers in your area and start saving money on every trip.</p>

  <hr style="border: none; border-top: 2px solid #facc15; margin: 30px 0;">

  <h2 style="color: #000; font-size: 18px;">📍 Step 1 — Update Your Approximate Location</h2>
  <p style="font-size: 16px;">This helps nearby drivers see you're in the community and ready for trip requests.</p>
  <p style="font-size: 16px; background: #f5f5f5; padding: 12px; border-radius: 8px; border-left: 4px solid #facc15;">
    Open: <strong>Map → Update My Pin</strong>
  </p>
  <p style="font-size: 16px;">Your pin is approximate only, never precise.</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <h2 style="color: #000; font-size: 18px;">🧩 Step 2 — Complete Your Rider Profile</h2>
  <p style="font-size: 16px;">This helps drivers quickly recognize and trust your account.</p>
  <p style="font-size: 16px;">Add your:</p>
  <ul style="font-size: 16px;">
    <li>Profile photo</li>
    <li>Any optional information you'd like drivers to see</li>
  </ul>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <h2 style="color: #000; font-size: 18px;">💛 Why This Matters</h2>
  <p style="font-size: 16px;">The CashRidez map works best when everyone is visible and recently active. By updating your location, you help grow a strong Georgia community where everyone earns and saves more.</p>

  <p style="font-size: 16px;">Welcome aboard — let's ride!</p>

  <div style="background: #000; color: #facc15; padding: 20px; border-radius: 8px; margin-top: 30px; text-align: center;">
    <p style="margin: 0; font-size: 18px; font-weight: bold;">💛🚗💰</p>
    <p style="margin: 10px 0 0 0; color: #fff; font-size: 14px;">— CashRidez Team<br>CashRidez Connect LLC</p>
  </div>
</body>
</html>
  `;
}

async function processQueuedEmail(
  supabase: any,
  queueItem: QueuedEmail
): Promise<{ success: boolean; error?: string }> {
  const { id, user_id, user_email, first_name, is_driver, is_rider } = queueItem;
  
  console.log(`Processing queued email for user ${user_id}, email: ${user_email}`);

  // Determine primary role
  const primaryRole = getPrimaryRole(is_driver, is_rider);
  const emailType = primaryRole === "driver" 
    ? "verification_welcome_driver" 
    : "verification_welcome_rider";

  // Check for existing successful email in email_logs (prevent duplicates)
  const { data: existingLog } = await supabase
    .from("email_logs")
    .select("id")
    .eq("user_id", user_id)
    .eq("email_type", emailType)
    .eq("status", "success")
    .maybeSingle();

  if (existingLog) {
    console.log(`Email already sent to user ${user_id} for type ${emailType}, marking as processed`);
    
    // Mark queue item as processed (already sent)
    await supabase
      .from("verification_email_queue")
      .update({ status: "already_sent", processed_at: new Date().toISOString() })
      .eq("id", id);
    
    return { success: true };
  }

  // Create pending log entry
  const { data: logEntry } = await supabase
    .from("email_logs")
    .insert({
      user_id,
      email_type: emailType,
      recipient_email: user_email,
      status: "pending",
      metadata: { first_name, is_driver, is_rider, primaryRole }
    })
    .select("id")
    .single();

  const logId = logEntry?.id;
  const displayName = first_name || "there";

  // Prepare email content
  const subject = primaryRole === "driver"
    ? "🚗 You're Verified! Your Driver Profile Is Now Active on CashRidez"
    : "🎉 You're Verified — Welcome to CashRidez!";

  const html = primaryRole === "driver"
    ? getDriverEmailHtml(displayName)
    : getRiderEmailHtml(displayName);

  // Send email with retry
  let emailSent = false;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`Sending email attempt ${attempt} to ${user_email}`);
      
      const emailResponse = await resend.emails.send({
        from: "CashRidez <noreply@cashridez.com>",
        to: [user_email],
        subject: subject,
        html: html,
      });

      console.log(`Email sent successfully on attempt ${attempt}:`, emailResponse);
      emailSent = true;
      break;
    } catch (error: any) {
      console.error(`Email send attempt ${attempt} failed:`, error);
      lastError = error;
      
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  // Update log entry
  if (logId) {
    await supabase
      .from("email_logs")
      .update({
        status: emailSent ? "success" : "failed",
        error_message: emailSent ? null : lastError?.message,
        timestamp_sent: new Date().toISOString()
      })
      .eq("id", logId);
  }

  // Update queue item
  await supabase
    .from("verification_email_queue")
    .update({ 
      status: emailSent ? "sent" : "failed", 
      processed_at: new Date().toISOString() 
    })
    .eq("id", id);

  return emailSent 
    ? { success: true } 
    : { success: false, error: lastError?.message };
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if this is a direct call with user data or a queue processing call
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body = process queue
    }

    // If userId is provided, process single user directly
    if (body.userId) {
      const { userId, userEmail, firstName, isDriver, isRider } = body;
      
      console.log(`Direct call for user ${userId}`);
      
      const result = await processQueuedEmail(supabase, {
        id: 'direct-' + userId,
        user_id: userId,
        user_email: userEmail,
        first_name: firstName,
        is_driver: isDriver ?? false,
        is_rider: isRider ?? false
      });

      return new Response(
        JSON.stringify(result),
        {
          status: result.success ? 200 : 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Otherwise, process the queue
    console.log("Processing verification email queue...");

    // Fetch pending queue items
    const { data: queueItems, error: fetchError } = await supabase
      .from("verification_email_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10);

    if (fetchError) {
      console.error("Error fetching queue:", fetchError);
      throw fetchError;
    }

    if (!queueItems || queueItems.length === 0) {
      console.log("No pending emails in queue");
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log(`Found ${queueItems.length} pending emails to process`);

    // Process each queued email
    const results = await Promise.all(
      queueItems.map((item: QueuedEmail) => processQueuedEmail(supabase, item))
    );

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    console.log(`Processed ${successCount} emails successfully, ${failedCount} failed`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: queueItems.length,
        successful: successCount,
        failed: failedCount
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("Error in send-verification-welcome-email function:", error);
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
