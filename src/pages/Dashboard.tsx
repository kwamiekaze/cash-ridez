import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkProfile = async () => {
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!profile) {
        navigate("/onboarding");
        return;
      }

      // Check if user is verified - if not, redirect to onboarding to see status
      if (!profile.is_verified && profile.verification_status !== 'approved') {
        navigate("/onboarding");
        return;
      }

      // Check if user is admin
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const isAdmin = roles?.some((r) => r.role === "admin");

      if (isAdmin) {
        navigate("/admin");
        setLoading(false);
        return;
      }

      // Route based on active_role - if set, send them to their role's dashboard
      if (profile.active_role === 'driver') {
        navigate("/trips");
      } else if (profile.active_role === 'rider') {
        navigate("/rider");
      } else {
        // No role set yet - default to rider dashboard for first-time users
        navigate("/rider");
      }

      setLoading(false);
    };

    checkProfile();
  }, [user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return null;
};

export default Dashboard;
