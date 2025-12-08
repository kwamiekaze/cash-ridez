import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import AppHeader from "@/components/AppHeader";
import { LiveMapView } from "@/components/LiveMapView";
import { MapBackground } from "@/components/MapBackground";
import { DashboardCar } from "@/components/DashboardCar";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
// FloatingSupport intentionally removed from Live Map page

const LiveMap = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Set page title
  useEffect(() => {
    document.title = "Live Map | CashRidez";
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Public view for non-logged-in users
  if (!user) {
    return (
      <div className="min-h-screen bg-background relative">
        <MapBackground showAnimatedCar={false} showRiders={false} intensity="subtle" className="fixed inset-0 z-0" />
        
        <div className="relative z-10">
          <AppHeader showCar={false} />

          <div className="container mx-auto px-4 py-8">
            <div className="max-w-lg mx-auto text-center">
              <div className="bg-card/80 backdrop-blur-sm border border-border rounded-2xl p-8 shadow-xl">
                <h1 className="text-2xl font-bold text-foreground mb-4">
                  Cash Ridez Connect Map
                </h1>
                <p className="text-muted-foreground mb-6">
                  Sign in to view the live community map and connect with drivers and riders in your area.
                </p>
                <Button 
                  onClick={() => navigate("/auth")}
                  className="gap-2"
                  size="lg"
                >
                  <LogIn className="w-4 h-4" />
                  Sign In to View Map
                </Button>
              </div>
            </div>
          </div>
        </div>
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
    </div>
  );
};

export default LiveMap;
