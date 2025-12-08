import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import AppHeader from "@/components/AppHeader";
import { LiveMapView } from "@/components/LiveMapView";
import { PublicLiveMapView } from "@/components/PublicLiveMapView";
import { MapBackground } from "@/components/MapBackground";
import { DashboardCar } from "@/components/DashboardCar";
import { Button } from "@/components/ui/button";
import { LogIn, UserPlus, CheckCircle, DollarSign, Shield, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";

const LiveMap = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Set page title
  useEffect(() => {
    document.title = "Cash Ride Map | CashRidez – Cash Rides & Community Rideshare in Georgia";
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
        <Helmet>
          <title>Cash Ride Map | CashRidez – Cash Rides & Community Rideshare in Georgia</title>
          <meta 
            name="description" 
            content="Explore the CashRidez live community map to see real cash rides in Georgia. View active drivers and riders, compare traditional rideshare costs, and sign up in minutes to start posting trips and earning more from every cash ride." 
          />
          <meta name="keywords" content="cash ride, cash rides, Georgia rideshare, rideshare alternative, cash ride Georgia, driver earnings, rider savings" />
          <link rel="canonical" href="https://cashridez.com/map" />
          <meta property="og:title" content="Cash Ride Map | CashRidez – Real Cash Rides in Georgia" />
          <meta property="og:description" content="Explore the CashRidez live community map. See active drivers and riders in Georgia and start your cash ride journey." />
          <meta property="og:url" content="https://cashridez.com/map" />
          <meta property="og:type" content="website" />
          <script type="application/ld+json">
            {JSON.stringify({
              "@context": "https://schema.org",
              "@type": "LocalBusiness",
              "name": "CashRidez",
              "description": "Georgia's community-based cash ride and rideshare alternative. Connect directly with local drivers and riders.",
              "url": "https://cashridez.com",
              "areaServed": {
                "@type": "State",
                "name": "Georgia",
                "addressCountry": "US"
              },
              "serviceType": "Rideshare Platform",
              "sameAs": [
                "https://cashridez.com"
              ]
            })}
          </script>
        </Helmet>
        
        <MapBackground showAnimatedCar={false} showRiders={false} intensity="subtle" className="fixed inset-0 z-0" />
        
        <div className="relative z-10">
          {/* Simple header for public view */}
          <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
            <div className="container mx-auto px-4 py-3">
              <div className="flex items-center justify-between">
                <span 
                  onClick={() => navigate('/')}
                  className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-400 bg-clip-text text-transparent cursor-pointer"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  CashRidez
                </span>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost"
                    onClick={() => navigate("/auth")}
                    className="text-foreground"
                  >
                    Sign In
                  </Button>
                  <Button 
                    onClick={() => navigate("/auth")}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Get Started
                  </Button>
                </div>
              </div>
            </div>
          </header>

          <div className="container mx-auto px-4 py-6">
            {/* SEO H1 and CTA Section */}
            <div className="max-w-4xl mx-auto mb-6">
              <div className="bg-card/80 backdrop-blur-sm border border-border rounded-2xl p-6 shadow-xl">
                <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
                  Cash Ridez Connect Map – Real Cash Rides in Georgia
                </h1>
                <p className="text-muted-foreground mb-4">
                  View the live community map and see who's active in your area. Sign in to drop your pin, connect with riders and drivers, and start earning or saving today.
                </p>
                <Button 
                  onClick={() => navigate("/auth")}
                  className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  size="lg"
                >
                  <LogIn className="w-4 h-4" />
                  Sign in to Update Pin
                </Button>
              </div>
            </div>

            {/* Public Map View */}
            <PublicLiveMapView className="w-full mb-8" />

            {/* SEO Content Section */}
            <div className="max-w-4xl mx-auto mt-8 mb-12">
              <div className="bg-card/80 backdrop-blur-sm border border-border rounded-2xl p-6 md:p-8 shadow-xl">
                <h2 className="text-xl md:text-2xl font-bold text-foreground mb-6">
                  Why CashRidez Is the Cash Ride Alternative for Georgia
                </h2>
                
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Direct Cash Rides</h3>
                      <p className="text-sm text-muted-foreground">
                        Connect directly with local riders and drivers in Georgia. No middleman fees eating into your earnings.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Keep 100% of Your Earnings</h3>
                      <p className="text-sm text-muted-foreground">
                        Drivers keep every dollar. Riders save compared to traditional rideshare apps.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Verified Users</h3>
                      <p className="text-sm text-muted-foreground">
                        Every member is verified. Our community-based platform prioritizes safety and trust.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Privacy First</h3>
                      <p className="text-sm text-muted-foreground">
                        We only show approximate locations on the map. Your exact address is never shared.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-6">
                  <p className="text-center text-muted-foreground mb-4">
                    Ready to join Georgia's growing cash ride community?
                  </p>
                  <div className="flex justify-center">
                    <Button 
                      onClick={() => navigate("/auth")}
                      className="gap-2 bg-gradient-to-r from-yellow-500 to-emerald-500 hover:from-yellow-600 hover:to-emerald-600 text-black font-semibold"
                      size="lg"
                    >
                      <UserPlus className="w-4 h-4" />
                      Create Free Account
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      <Helmet>
        <title>Cash Ride Map | CashRidez – Cash Rides & Community Rideshare in Georgia</title>
        <meta 
          name="description" 
          content="Explore the CashRidez live community map to see real cash rides in Georgia. View active drivers and riders, compare traditional rideshare costs, and sign up in minutes to start posting trips and earning more from every cash ride." 
        />
      </Helmet>
      
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
