import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setProfileLoading(false);
        return;
      }
      
      const { data } = await supabase
        .from("profiles")
        .select("is_verified, verification_status, active_role")
        .eq("id", user.id)
        .single();
      
      setProfile(data);
      setProfileLoading(false);
    };

    fetchProfile();
  }, [user]);

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Don't redirect verified users back to onboarding
  if (location.pathname === "/onboarding" && profile?.is_verified) {
    // Redirect verified users to appropriate dashboard based on active_role
    if (profile.active_role === 'driver') {
      return <Navigate to="/driver" replace />;
    } else if (profile.active_role === 'rider') {
      return <Navigate to="/rider" replace />;
    } else {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
