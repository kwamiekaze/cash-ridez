import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  action: "send_reset_email" | "set_temp_password" | "revoke_sessions";
  targetUserId: string;
  tempPassword?: string;
  revokeSessionsOnReset?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Get admin auth from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token to verify they're an admin
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify admin role using the has_role function
    const { data: isAdmin, error: roleError } = await supabaseUser.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (roleError || !isAdmin) {
      console.error("Admin check failed:", roleError);
      return new Response(
        JSON.stringify({ success: false, error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { action, targetUserId, tempPassword, revokeSessionsOnReset = true } = body;

    if (!action || !targetUserId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing action or targetUserId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin client with service role for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get target user details
    const { data: targetUser, error: targetError } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
    if (targetError || !targetUser) {
      console.error("Failed to get target user:", targetError);
      return new Response(
        JSON.stringify({ success: false, error: "Target user not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract IP and User Agent for audit log
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    let result: { success: boolean; message?: string; error?: string } = { success: false };

    switch (action) {
      case "send_reset_email": {
        console.log(`Admin ${user.id} sending password reset email to ${targetUserId}`);
        
        // Use Supabase's built-in password recovery
        const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email: targetUser.user.email!,
        });

        if (resetError) {
          console.error("Failed to generate reset link:", resetError);
          result = { success: false, error: resetError.message };
        } else {
          // Actually send the email using resetPasswordForEmail
          const { error: emailError } = await supabaseAdmin.auth.resetPasswordForEmail(
            targetUser.user.email!,
            {
              redirectTo: `${req.headers.get("origin") || "https://cashridez.com"}/reset-password`,
            }
          );

          if (emailError) {
            console.error("Failed to send reset email:", emailError);
            result = { success: false, error: emailError.message };
          } else {
            result = { success: true, message: "Password reset email sent successfully" };
          }
        }
        break;
      }

      case "set_temp_password": {
        if (!tempPassword) {
          return new Response(
            JSON.stringify({ success: false, error: "Temporary password is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate password requirements: min 12 chars, 1 number, 1 symbol
        if (tempPassword.length < 12) {
          return new Response(
            JSON.stringify({ success: false, error: "Password must be at least 12 characters" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (!/\d/.test(tempPassword)) {
          return new Response(
            JSON.stringify({ success: false, error: "Password must contain at least 1 number" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(tempPassword)) {
          return new Response(
            JSON.stringify({ success: false, error: "Password must contain at least 1 symbol" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`Admin ${user.id} setting temporary password for ${targetUserId}`);

        // Update user's password
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          password: tempPassword,
        });

        if (updateError) {
          console.error("Failed to set temporary password:", updateError);
          result = { success: false, error: updateError.message };
        } else {
          // Set must_change_password flag
          const { error: flagError } = await supabaseAdmin
            .from("profiles")
            .update({ must_change_password: true })
            .eq("id", targetUserId);

          if (flagError) {
            console.error("Failed to set must_change_password flag:", flagError);
          }

          // Revoke sessions if requested
          if (revokeSessionsOnReset) {
            await supabaseAdmin.auth.admin.signOut(targetUserId, "global");
          }

          result = { 
            success: true, 
            message: `Temporary password set${revokeSessionsOnReset ? " and sessions revoked" : ""}. User must change password on next login.` 
          };
        }
        break;
      }

      case "revoke_sessions": {
        console.log(`Admin ${user.id} revoking all sessions for ${targetUserId}`);

        const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(targetUserId, "global");

        if (signOutError) {
          console.error("Failed to revoke sessions:", signOutError);
          result = { success: false, error: signOutError.message };
        } else {
          result = { success: true, message: "All sessions revoked successfully" };
        }
        break;
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Log admin action
    if (result.success) {
      const { error: logError } = await supabaseAdmin.from("admin_actions").insert({
        admin_id: user.id,
        target_user_id: targetUserId,
        action_type: action,
        metadata: {
          revoke_sessions: action === "set_temp_password" ? revokeSessionsOnReset : undefined,
        },
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      if (logError) {
        console.error("Failed to log admin action:", logError);
        // Don't fail the request if logging fails
      }
    }

    return new Response(
      JSON.stringify(result),
      { status: result.success ? 200 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
