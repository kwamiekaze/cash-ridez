import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook that checks if the current user is blocked and redirects to /blocked if so.
 * Should be used in the AuthContext or a high-level component.
 */
export function useBlockedCheck(userId: string | null) {
  const navigate = useNavigate();

  const checkBlockedStatus = useCallback(async () => {
    if (!userId) return;

    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("blocked")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error checking blocked status:", error);
        return;
      }

      if (profile?.blocked) {
        // Sign out and redirect to blocked page
        await supabase.auth.signOut();
        navigate("/blocked", { replace: true });
      }
    } catch (err) {
      console.error("Error in blocked check:", err);
    }
  }, [userId, navigate]);

  useEffect(() => {
    checkBlockedStatus();

    // Also listen for realtime changes to the blocked status
    if (!userId) return;

    const channel = supabase
      .channel(`profile-blocked-${userId}-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new && (payload.new as any).blocked === true) {
            // User was just blocked - sign out and redirect
            supabase.auth.signOut().then(() => {
              navigate("/blocked", { replace: true });
            });
          }
        }
      )
      .subscribe((status, err) => {
        if (err) console.warn('[realtime] subscription error:', err);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, checkBlockedStatus, navigate]);

  return { checkBlockedStatus };
}
