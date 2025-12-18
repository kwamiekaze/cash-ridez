import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Password policy matching frontend signup rules
const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
};

interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password) {
    errors.push("Password is required");
    return { isValid: false, errors };
  }

  if (password.length < PASSWORD_POLICY.minLength) {
    errors.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters`);
  }

  if (password.length > PASSWORD_POLICY.maxLength) {
    errors.push(`Password must be less than ${PASSWORD_POLICY.maxLength} characters`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

interface RequestBody {
  action: "send_reset_email" | "set_temp_password" | "revoke_sessions";
  targetUserId: string;
  tempPassword?: string;
  revokeSessionsOnReset?: boolean;
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check required environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl) {
      console.error(`[${requestId}] Missing SUPABASE_URL`);
      return new Response(
        JSON.stringify({ success: false, error: "Missing server configuration: SUPABASE_URL" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!supabaseServiceKey) {
      console.error(`[${requestId}] Missing SUPABASE_SERVICE_ROLE_KEY`);
      return new Response(
        JSON.stringify({ success: false, error: "Missing server configuration: SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!supabaseAnonKey) {
      console.error(`[${requestId}] Missing SUPABASE_ANON_KEY`);
      return new Response(
        JSON.stringify({ success: false, error: "Missing server configuration: SUPABASE_ANON_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get admin auth from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log(`[${requestId}] Missing authorization header`);
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token to verify they're an admin
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.log(`[${requestId}] Auth failed:`, userError?.message);
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
      console.log(`[${requestId}] Admin check failed for user ${user.id}:`, roleError?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    let body: RequestBody;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error(`[${requestId}] Failed to parse request body:`, parseError);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const { action, targetUserId, tempPassword, revokeSessionsOnReset = true } = body;

    // Log structured request info
    console.log(`[${requestId}] Admin password reset request`, {
      requestId,
      timestamp,
      adminUserId: user.id,
      targetUserId,
      action,
      revokeSessionsOnReset: action === "set_temp_password" ? revokeSessionsOnReset : undefined,
    });

    if (!action || !targetUserId) {
      console.log(`[${requestId}] Missing action or targetUserId`);
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
      console.log(`[${requestId}] Target user not found:`, targetError?.message);
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
        console.log(`[${requestId}] Sending password reset email to ${targetUser.user.email}`);
        
        // Use Supabase's built-in password recovery
        const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email: targetUser.user.email!,
        });

        if (resetError) {
          console.error(`[${requestId}] Failed to generate reset link:`, resetError.message);
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
            console.error(`[${requestId}] Failed to send reset email:`, emailError.message);
            result = { success: false, error: emailError.message };
          } else {
            console.log(`[${requestId}] Password reset email sent successfully`);
            result = { success: true, message: "Password reset email sent successfully" };
          }
        }
        break;
      }

      case "set_temp_password": {
        if (!tempPassword) {
          console.log(`[${requestId}] Temp password validation failed: password required`);
          return new Response(
            JSON.stringify({ success: false, error: "Temporary password is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate password using shared policy
        const validation = validatePassword(tempPassword);
        if (!validation.isValid) {
          console.log(`[${requestId}] Temp password validation failed:`, validation.errors);
          return new Response(
            JSON.stringify({ success: false, error: validation.errors[0] }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[${requestId}] Setting temporary password for user ${targetUserId}`);

        // Update user's password
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          password: tempPassword,
        });

        if (updateError) {
          console.error(`[${requestId}] Failed to set temporary password:`, updateError.message);
          result = { success: false, error: updateError.message };
        } else {
          // Set must_change_password flag
          const { error: flagError } = await supabaseAdmin
            .from("profiles")
            .update({ must_change_password: true })
            .eq("id", targetUserId);

          if (flagError) {
            console.error(`[${requestId}] Failed to set must_change_password flag:`, flagError.message);
          }

          // Revoke sessions if requested
          if (revokeSessionsOnReset) {
            const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(targetUserId, "global");
            if (signOutError) {
              console.error(`[${requestId}] Failed to revoke sessions:`, signOutError.message);
            } else {
              console.log(`[${requestId}] Sessions revoked for user ${targetUserId}`);
            }
          }

          console.log(`[${requestId}] Temporary password set successfully`);
          result = { 
            success: true, 
            message: `Temporary password set${revokeSessionsOnReset ? " and sessions revoked" : ""}. User must change password on next login.` 
          };
        }
        break;
      }

      case "revoke_sessions": {
        console.log(`[${requestId}] Revoking all sessions for user ${targetUserId}`);

        const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(targetUserId, "global");

        if (signOutError) {
          console.error(`[${requestId}] Failed to revoke sessions:`, signOutError.message);
          result = { success: false, error: signOutError.message };
        } else {
          console.log(`[${requestId}] All sessions revoked successfully`);
          result = { success: true, message: "All sessions revoked successfully" };
        }
        break;
      }

      default:
        console.log(`[${requestId}] Invalid action: ${action}`);
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
          request_id: requestId,
          revoke_sessions: action === "set_temp_password" ? revokeSessionsOnReset : undefined,
        },
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      if (logError) {
        console.error(`[${requestId}] Failed to log admin action:`, logError.message);
        // Don't fail the request if logging fails
      }
    }

    return new Response(
      JSON.stringify(result),
      { status: result.success ? 200 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`[${requestId}] Unexpected error:`, error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
