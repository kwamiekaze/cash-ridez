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

      // PRIORITY: Check for active trips FIRST (assigned > open)
      const { data: activeTrips } = await supabase
        .from("ride_requests")
        .select("*")
        .or(`and(rider_id.eq.${user.id},status.eq.assigned),and(assigned_driver_id.eq.${user.id},status.eq.assigned),and(rider_id.eq.${user.id},status.eq.open)`)
        .order("status", { ascending: true }) // assigned comes before open
        .limit(1);

      // If user has an active trip, show it immediately
      if (activeTrips && activeTrips.length > 0) {
        navigate(`/trip/${activeTrips[0].id}`);
        setLoading(false);
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
      } else {
        // All verified users go to unified dashboard
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
