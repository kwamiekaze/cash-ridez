import { createLovableAuth } from "@lovable.dev/cloud-auth-js";
import { supabase } from "@/integrations/supabase/client";

export const lovable = createLovableAuth({});

/**
 * Starts the Lovable-managed Google OAuth flow.
 * Returns true when a session was set (or a redirect is in progress).
 */
export async function signInWithGoogle(redirectUri: string = window.location.origin) {
  const result = await lovable.auth.signInWithOAuth("google", {
    redirect_uri: redirectUri,
  });

  if (result.error) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : (result.error as { message?: string })?.message || "Google sign-in failed"
    );
  }

  if (result.redirected) {
    return { redirected: true } as const;
  }

  const { error } = await supabase.auth.setSession({
    access_token: result.session.access_token,
    refresh_token: result.session.refresh_token,
  });

  if (error) throw error;

  return { redirected: false } as const;
}
