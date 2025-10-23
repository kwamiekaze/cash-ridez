import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import AppHeader from "@/components/AppHeader";
import { MapPin, User, History, Activity, AlertCircle } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import AcceptRideDialog from "@/components/AcceptRideDialog";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { UserChip } from "@/components/UserChip";
import { DriverAvailability } from "@/components/DriverAvailability";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { SubscriptionPanel } from "@/components/SubscriptionPanel";
import { TripLimitGate } from "@/components/TripLimitGate";

const DriverDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [myActiveTrips, setMyActiveTrips] = useState<any[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [zipFilter, setZipFilter] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user?.id).single();
      setProfile(data);
    };

    const fetchMyActiveTrips = async () => {
      // Fetch trips where current user is the assigned driver
      const { data } = await supabase
        .from("ride_requests")
        .select("*, rider:profiles!rider_id(display_name, full_name, photo_url, rider_rating_avg, rider_rating_count, is_member)")
        .eq("assigned_driver_id", user?.id)
        .eq("status", "assigned")
        .order("updated_at", { ascending: false }); // Most recently updated first
      
      setMyActiveTrips(data || []);
    };

    const fetchRequests = async () => {
      let query = supabase
        .from("ride_requests")
        .select("*, rider:profiles!rider_id(display_name, full_name, photo_url, rider_rating_avg, rider_rating_count, is_member)")
        .eq("status", "open")
        .order("created_at", { ascending: false }); // Most recent first

      if (zipFilter) {
        query = query.or(`pickup_zip.eq.${zipFilter},dropoff_zip.eq.${zipFilter}`);
      }

      const { data } = await query;
      setRequests(data || []);
    };

    fetchProfile();
    fetchMyActiveTrips();
    fetchRequests();

    // Subscribe to new requests
    const channel = supabase
      .channel("ride_requests_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ride_requests",
        },
        () => {
          fetchMyActiveTrips();
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, zipFilter]);

  const filteredRequests = requests.filter((req) => {
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      return (
        req.pickup_address.toLowerCase().includes(keyword) ||
        req.dropoff_address.toLowerCase().includes(keyword) ||
        req.rider_note?.toLowerCase().includes(keyword)
      );
    }
    return true;
  });

  const handleAcceptClick = (request: any) => {
    setSelectedRequest(request);
    setAcceptDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Verification Notice */}
        {!profile?.is_verified && (
          <Card className="mb-6 border-warning bg-warning/5">
            <CardContent className="p-6">
              <div className="flex gap-4">
                <AlertCircle className="h-6 w-6 text-warning flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold mb-2">Account Verification Required</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Your account needs verification before you can accept rides. Submit your documents to get verified.
                  </p>
                  <Button onClick={() => navigate("/verification")}>
                    Complete Verification
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Section: Driver Availability and Subscription */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <DriverAvailability />
          <SubscriptionPanel />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <Button
            variant="outline"
            className="h-auto py-3 sm:py-4 flex flex-col gap-2 border-2 border-primary/20 hover:border-primary hover:bg-primary/5 transition-all"
            onClick={() => {
              const openSection = document.getElementById("available-requests");
              openSection?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <MapPin className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <span className="text-xs sm:text-sm font-medium">Find Requests</span>
          </Button>
          
          <Button
            variant="outline"
            className="h-auto py-3 sm:py-4 flex flex-col gap-2 border-2 border-primary/20 hover:border-primary hover:bg-primary/5 transition-all"
            onClick={() => navigate("/profile")}
          >
            <User className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <span className="text-xs sm:text-sm font-medium">View Profile</span>
          </Button>
          
          <Button
            variant="outline"
            className="h-auto py-3 sm:py-4 flex flex-col gap-2 border-2 border-primary/20 hover:border-primary hover:bg-primary/5 transition-all"
            onClick={() => navigate("/trip-history")}
          >
            <History className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <span className="text-xs sm:text-sm font-medium">Trip History</span>
          </Button>
          
          <Button
            variant="outline"
            className="h-auto py-3 sm:py-4 flex flex-col gap-2 border-2 border-primary/20 hover:border-primary hover:bg-primary/5 transition-all"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <Activity className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <span className="text-xs sm:text-sm font-medium">Availability</span>
          </Button>
        </div>

        {/* My Active Trips (Connected) - Show prominently if any exist */}
        {myActiveTrips.length > 0 && (
          <div className="space-y-4 mb-8">
            <h2 className="text-2xl font-bold text-primary">My Active Trips ({myActiveTrips.length})</h2>
            <p className="text-sm text-muted-foreground mb-4">Trips you've accepted and are currently active</p>
            {myActiveTrips.map((trip) => (
              <Card 
                key={trip.id} 
                className="p-6 border-2 border-primary hover:shadow-glow transition-all cursor-pointer"
                onClick={() => navigate(`/trip/${trip.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <StatusBadge status={trip.status} />
                      <span className="text-xs text-muted-foreground">
                        Connected at {format(new Date(trip.updated_at), "h:mm a")}
                      </span>
                    </div>
                    {/* Rider Info */}
                    {trip.rider && <UserChip userId={trip.rider_id} displayName={trip.rider.display_name} fullName={trip.rider.full_name} photoUrl={trip.rider.photo_url} role="rider" ratingAvg={trip.rider.rider_rating_avg} ratingCount={trip.rider.rider_rating_count} size="md" className="mb-3" />}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 mt-1 text-success" />
                        <div>
                          <p className="font-medium">Pickup</p>
                          <p className="text-sm text-muted-foreground">{trip.pickup_address}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 mt-1 text-destructive" />
                        <div>
                          <p className="font-medium">Dropoff</p>
                          <p className="text-sm text-muted-foreground">{trip.dropoff_address}</p>
                        </div>
                      </div>
                    </div>
                    {trip.price_offer && (
                      <p className="text-lg font-semibold text-primary">
                        Price: ${trip.price_offer}
                      </p>
                    )}
                  </div>
                  <Button variant="default" onClick={(e) => { e.stopPropagation(); navigate(`/trip/${trip.id}`); }}>
                    View Trip
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Filters */}
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Find Trip Requests</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by address or note..."
                className="pl-10"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
              />
            </div>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter by zip code..."
                className="pl-10"
                value={zipFilter}
                onChange={(e) => setZipFilter(e.target.value)}
              />
            </div>
          </div>
        </Card>

        {/* Available Trip Requests */}
        <div className="space-y-4" id="available-requests">
          <h2 className="text-2xl font-bold">Available Trip Requests ({filteredRequests.length})</h2>
          {filteredRequests.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No trip requests available matching your filters</p>
            </Card>
          ) : (
            filteredRequests.map((request) => (
              <Card key={request.id} className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <StatusBadge status={request.status} />
                      <span className="text-xs text-muted-foreground">
                        Requested at {format(new Date(request.created_at), "h:mm a")}
                      </span>
                    </div>
                    {/* Rider Info */}
                    {request.rider && <UserChip userId={request.rider_id} displayName={request.rider.display_name} fullName={request.rider.full_name} photoUrl={request.rider.photo_url} role="rider" ratingAvg={request.rider.rider_rating_avg} ratingCount={request.rider.rider_rating_count} size="md" className="mb-3" />}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 mt-1 text-success" />
                        <div>
                          <p className="font-medium">Pickup</p>
                          <p className="text-sm text-muted-foreground">{request.pickup_address}</p>
                          <p className="text-xs text-muted-foreground">Zip: {request.pickup_zip}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 mt-1 text-destructive" />
                        <div>
                          <p className="font-medium">Dropoff</p>
                          <p className="text-sm text-muted-foreground">{request.dropoff_address}</p>
                          <p className="text-xs text-muted-foreground">Zip: {request.dropoff_zip}</p>
                        </div>
                      </div>
                    </div>
                    {request.price_offer && (
                      <p className="text-lg font-semibold text-primary">
                        Offered: ${request.price_offer}
                      </p>
                    )}
                  </div>
                  <TripLimitGate
                    action="accept trip request"
                    onProceed={() => handleAcceptClick(request)}
                  >
                    <Button 
                      className="bg-gradient-primary w-full" 
                      disabled={!(profile?.is_verified || profile?.verification_status === "approved")} 
                    >
                      Connect
                    </Button>
                  </TripLimitGate>
                </div>
              </Card>
            ))
          )}
        </div>

        {selectedRequest && (
          <AcceptRideDialog
            request={selectedRequest}
            open={acceptDialogOpen}
            onOpenChange={setAcceptDialogOpen}
            driverId={user?.id || ""}
          />
        )}
      </div>
    </div>
  );
};

export default DriverDashboard;
