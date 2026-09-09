import { createLovableAuth } from "@lovable.dev/cloud-auth-js";
import { supabase } from "@/integrations/supabase/client";

export const lovableAuth = createLovableAuth({});

/**
 * Starts the Lovable-managed Google OAuth flow.
 * Returns { redirected: true } when the browser is navigating to Google.
 */
export async function signInWithGoogle(redirectUri: string = window.location.origin) {
  const result = await lovableAuth.signInWithOAuth("google", {
    redirect_uri: redirectUri,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.redirected) {
    return { redirected: true } as const;
  }

  const { error } = await supabase.auth.setSession({
    access_token: result.tokens.access_token,
    refresh_token: result.tokens.refresh_token,
  });

  if (error) throw error;

  return { redirected: false } as const;
}
