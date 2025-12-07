import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AppHeader from "@/components/AppHeader";
import { LiveMapView } from "@/components/LiveMapView";
import { MapBackground } from "@/components/MapBackground";
import { DashboardCar } from "@/components/DashboardCar";
import FloatingSupport from "@/components/FloatingSupport";

const LiveMap = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Set page title
  useEffect(() => {
    document.title = "Live Map | CashRidez";
  }, []);

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      {/* Animated Map Background */}
      <MapBackground showAnimatedCar={false} showRiders={false} intensity="subtle" className="fixed inset-0 z-0" />
      
      <div className="relative z-10">
        <AppHeader showCar={false} />
        <DashboardCar />

        <div className="container mx-auto px-4 py-8">
          <LiveMapView className="w-full" />
        </div>
      </div>

      <FloatingSupport />
    </div>
  );
};

export default LiveMap;
