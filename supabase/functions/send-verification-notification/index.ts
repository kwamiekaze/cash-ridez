// Email delivery for ID submissions is owned by the database outbox
// (profiles / kyc_submissions triggers -> process-email-notifications).
// This function keeps ONLY the in-app admin notification, built from
// authoritative server-side state. It never sends email and never creates a
// signed ID URL. Caller-supplied names, emails and file paths are ignored.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Authenticate the caller. The body is never trusted.
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Unauthorized" }, 401);
    const { data: authData, error: authError } = await service.auth.getUser(jwt);
    if (authError || !authData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = authData.user.id;

    // Authoritative current state for this caller only.
    const { data: profile } = await service
      .from("profiles")
      .select("id, display_name, full_name, email, id_image_url, verification_status")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) return json({ error: "Profile not found" }, 404);

    const hasPendingProfileId =
      !!profile.id_image_url && profile.verification_status !== "verified";

    const { data: kycRows } = await service
      .from("kyc_submissions")
      .select("role, status")
      .eq("user_id", userId)
      .eq("status", "pending");

    const pendingRoles = new Set<string>((kycRows ?? []).map((r: { role: string }) => r.role));
    if (!hasPendingProfileId && pendingRoles.size === 0) {
      // Nothing pending server-side: nothing to announce.
      return json({ status: "accepted", queued: false });
    }

    const roles: string[] = [];
    if (pendingRoles.has("rider")) roles.push("Rider");
    if (pendingRoles.has("driver")) roles.push("Driver");
    const rolesText = roles.length ? roles.join(" & ") : "Verification";

    const displayName = profile.full_name || profile.display_name || "A user";
    const contact = profile.email || "no email on file";

    const { data: adminUsers, error: adminError } = await service
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (adminError) throw adminError;

    for (const admin of adminUsers ?? []) {
      await service.from("notifications").insert({
        user_id: admin.user_id,
        type: "verification_submitted",
        title: "New ID Verification Submitted",
        message: `${displayName} (${contact}) has submitted their ID for verification as ${rolesText}`,
        link: "/admin",
        related_user_id: userId,
      });
    }

    // Email is queued by the database outbox, not here.
    return json({ status: "accepted", queued: true });
  } catch (error) {
    console.error("send-verification-notification error:", error);
    return json({ error: "Failed to record verification notification" }, 500);
  }
};

serve(handler);
