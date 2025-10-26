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
        navigate("/driver");
      } else if (profile.active_role === 'rider') {
        navigate("/rider");
      } else {
        // No role set yet - check if they have active trips or default to rider
        const { data: activeTrips } = await supabase
          .from("ride_requests")
          .select("*")
          .or(`rider_id.eq.${user.id},assigned_driver_id.eq.${user.id}`)
          .in("status", ["open", "assigned"])
          .limit(1);
        
        if (activeTrips && activeTrips.length > 0) {
          // Has active trips - route based on their role in the trip
          const trip = activeTrips[0];
          if (trip.assigned_driver_id === user.id) {
            // Update their active_role to driver
            await supabase
              .from("profiles")
              .update({ active_role: 'driver' })
              .eq("id", user.id);
            navigate("/driver");
          } else {
            // Update their active_role to rider
            await supabase
              .from("profiles")
              .update({ active_role: 'rider' })
              .eq("id", user.id);
            navigate("/rider");
          }
        } else {
          // New user - send to onboarding to choose role
          navigate("/onboarding");
        }
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
