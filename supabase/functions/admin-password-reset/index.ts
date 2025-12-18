import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Password policy: MUST match frontend signup/admin shared rules.
const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
  requireNumber: false,
  requireSymbol: false,
  requireUppercase: false,
  requireLowercase: false,
} as const;

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

  if (PASSWORD_POLICY.requireNumber && !/\d/.test(password)) {
    errors.push("Password must contain at least 1 number");
  }

  if (
    PASSWORD_POLICY.requireSymbol &&
    !/[!@#$%^&*(),.?\":{}|<>\-_=+\[\]\\\\;'`~]/.test(password)
  ) {
    errors.push("Password must contain at least 1 symbol");
  }

  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least 1 uppercase letter");
  }

  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least 1 lowercase letter");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

type Action = "send_reset_email" | "set_temp_password" | "revoke_sessions";

interface RequestBody {
  action?: Action;
  targetUserId?: string;
  tempPassword?: string;
  // new name (preferred)
  revokeSessions?: boolean;
  // old name (back-compat)
  revokeSessionsOnReset?: boolean;
}

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Parse request body early (for logging)
  let body: RequestBody = {};
  try {
    body = await req.json();
  } catch {
    // body stays empty
  }

  const action = body.action;
  const targetUserId = body.targetUserId;
  const revokeSessions = body.revokeSessions ?? body.revokeSessionsOnReset ?? true;

  try {
    // Check required environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl) {
      console.error(`[${requestId}] Missing SUPABASE_URL`);
      return json(500, {
        success: false,
        ok: false,
        code: "MISSING_CONFIG",
        error: "Missing server configuration: SUPABASE_URL",
        requestId,
      });
    }

    if (!supabaseServiceKey) {
      console.error(`[${requestId}] Missing SUPABASE_SERVICE_ROLE_KEY`);
      return json(500, {
        success: false,
        ok: false,
        code: "MISSING_CONFIG",
        error: "Missing server configuration: SUPABASE_SERVICE_ROLE_KEY",
        requestId,
      });
    }

    if (!supabaseAnonKey) {
      console.error(`[${requestId}] Missing SUPABASE_ANON_KEY`);
      return json(500, {
        success: false,
        ok: false,
        code: "MISSING_CONFIG",
        error: "Missing server configuration: SUPABASE_ANON_KEY",
        requestId,
      });
    }

    // Require Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log(`[${requestId}] Missing authorization header`);
      return json(401, {
        success: false,
        ok: false,
        code: "UNAUTHORIZED",
        error: "Missing authorization header",
        requestId,
      });
    }

    // Verify caller (must be logged in & admin)
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: callerUser },
      error: callerError,
    } = await supabaseUser.auth.getUser();

    if (callerError || !callerUser) {
      console.log(`[${requestId}] Auth failed: ${callerError?.message || "unknown"}`);
      return json(401, {
        success: false,
        ok: false,
        code: "UNAUTHORIZED",
        error: callerError?.message || "Unauthorized",
        requestId,
      });
    }

    const { data: isAdmin, error: roleError } = await supabaseUser.rpc("has_role", {
      _user_id: callerUser.id,
      _role: "admin",
    });

    const callerRole = isAdmin ? "admin" : "non_admin";

    // Structured log (start)
    console.log(
      `[${requestId}] admin-password-reset:start`,
      JSON.stringify({
        requestId,
        timestamp,
        callerUserId: callerUser.id,
        callerRole,
        targetUserId,
        action,
        revokeSessions: action === "set_temp_password" ? revokeSessions : undefined,
      })
    );

    if (roleError || !isAdmin) {
      console.log(
        `[${requestId}] Admin check failed`,
        JSON.stringify({
          requestId,
          callerUserId: callerUser.id,
          roleError: roleError?.message || null,
        })
      );
      return json(403, {
        success: false,
        ok: false,
        code: "FORBIDDEN",
        error: "Admin privileges required",
        requestId,
      });
    }

    // Validate body fields
    if (!action || !targetUserId) {
      return json(400, {
        success: false,
        ok: false,
        code: "BAD_REQUEST",
        error: "Missing required fields: action, targetUserId",
        requestId,
      });
    }

    // Admin client for privileged ops
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Confirm target user exists
    const { data: targetUserResp, error: targetError } =
      await supabaseAdmin.auth.admin.getUserById(targetUserId);

    if (targetError || !targetUserResp?.user) {
      console.log(
        `[${requestId}] Target user lookup failed`,
        JSON.stringify({
          requestId,
          targetUserId,
          status: (targetError as any)?.status ?? null,
          error: targetError?.message || null,
        })
      );
      return json(404, {
        success: false,
        ok: false,
        code: "NOT_FOUND",
        error: "Target user not found",
        requestId,
      });
    }

    const ipAddress =
      req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    if (action === "send_reset_email") {
      // Use Supabase built-in password recovery flow
      const { error: emailError } = await supabaseAdmin.auth.resetPasswordForEmail(
        targetUserResp.user.email!,
        {
          redirectTo: `${req.headers.get("origin") || "https://cashridez.com"}/reset-password`,
        }
      );

      if (emailError) {
        console.log(
          `[${requestId}] reset email failed`,
          JSON.stringify({ requestId, status: (emailError as any)?.status ?? null, error: emailError.message })
        );
        return json(500, {
          success: false,
          ok: false,
          code: "RESET_EMAIL_FAILED",
          error: emailError.message,
          requestId,
        });
      }

      // audit log (success)
      await supabaseAdmin.from("admin_actions").insert({
        admin_id: callerUser.id,
        target_user_id: targetUserId,
        action_type: action,
        metadata: { request_id: requestId },
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      return json(200, {
        success: true,
        ok: true,
        message: "Password reset email sent successfully",
        requestId,
      });
    }

    if (action === "set_temp_password") {
      if (!body.tempPassword) {
        return json(400, {
          success: false,
          ok: false,
          code: "BAD_REQUEST",
          error: "Temporary password is required",
          requestId,
        });
      }

      const validation = validatePassword(body.tempPassword);
      console.log(
        `[${requestId}] password_policy`,
        JSON.stringify({ requestId, pass: validation.isValid, errors: validation.errors })
      );

      if (!validation.isValid) {
        return json(400, {
          success: false,
          ok: false,
          code: "PASSWORD_POLICY",
          error: validation.errors[0],
          requestId,
        });
      }

      // Sessions revoke: not supported by admin API using user_id. We must not crash.
      if (revokeSessions) {
        return json(400, {
          success: false,
          ok: false,
          code: "REVOKE_SESSIONS_UNSUPPORTED",
          error:
            "Session revocation is not supported by this server implementation. Uncheck 'Revoke all sessions' and try again.",
          requestId,
        });
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        password: body.tempPassword,
      });

      console.log(
        `[${requestId}] update_user_password`,
        JSON.stringify({
          requestId,
          status: (updateError as any)?.status ?? null,
          error: updateError?.message ?? null,
        })
      );

      if (updateError) {
        return json(500, {
          success: false,
          ok: false,
          code: "PASSWORD_UPDATE_FAILED",
          error: updateError.message,
          requestId,
        });
      }

      // Set must_change_password flag (non-fatal if it fails)
      const { error: flagError } = await supabaseAdmin
        .from("profiles")
        .update({ must_change_password: true })
        .eq("id", targetUserId);

      if (flagError) {
        console.log(
          `[${requestId}] must_change_password update failed`,
          JSON.stringify({ requestId, status: (flagError as any)?.status ?? null, error: flagError.message })
        );
      }

      // audit log (success)
      await supabaseAdmin.from("admin_actions").insert({
        admin_id: callerUser.id,
        target_user_id: targetUserId,
        action_type: action,
        metadata: {
          request_id: requestId,
          revoke_sessions: revokeSessions,
        },
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      return json(200, {
        success: true,
        ok: true,
        message: "Temporary password set. User must change password on next login.",
        requestId,
      });
    }

    // revoke_sessions action
    if (action === "revoke_sessions") {
      return json(400, {
        success: false,
        ok: false,
        code: "REVOKE_SESSIONS_UNSUPPORTED",
        error:
          "Session revocation is not supported by this server implementation.",
        requestId,
      });
    }

    return json(400, {
      success: false,
      ok: false,
      code: "BAD_REQUEST",
      error: "Invalid action",
      requestId,
    });
  } catch (err) {
    console.error(`[${requestId}] Unexpected error`, err);
    return json(500, {
      success: false,
      ok: false,
      code: "INTERNAL_ERROR",
      error: "Internal server error",
      requestId,
    });
  }
});
