import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export default function RoleRedirect() {
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setTarget("/auth");
          setLoading(false);
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_verified, verification_status, active_role")
          .eq("id", session.user.id)
          .single();

        if (profile?.is_verified || profile?.verification_status === "approved") {
          if (profile?.active_role === "driver") setTarget("/driver");
          else if (profile?.active_role === "rider") setTarget("/rider");
          else setTarget("/rider"); // default to rider if role not set
        } else {
          setTarget("/onboarding");
        }
      } catch (e) {
        console.error("RoleRedirect error", e);
        setTarget("/");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (target) return <Navigate to={target} replace />;
  return null;
}
