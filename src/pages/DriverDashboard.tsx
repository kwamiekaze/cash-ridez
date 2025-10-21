import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import AppHeader from "@/components/AppHeader";
import { Car, LogOut, MapPin, Search, User, Plus, History } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import AcceptRideDialog from "@/components/AcceptRideDialog";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { RatingDisplay } from "@/components/RatingDisplay";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
        .select("*, rider:profiles!rider_id(display_name, full_name, photo_url, rider_rating_avg, rider_rating_count)")
        .eq("assigned_driver_id", user?.id)
        .eq("status", "assigned")
        .order("created_at", { ascending: false });
      
      setMyActiveTrips(data || []);
    };

    const fetchRequests = async () => {
      let query = supabase
        .from("ride_requests")
        .select("*, rider:profiles!rider_id(display_name, full_name, photo_url, rider_rating_avg, rider_rating_count)")
        .eq("status", "open")
        .order("created_at", { ascending: false });

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

      <div className="container mx-auto px-4 py-8">
        {/* Verification Notice */}
        {profile && !profile.is_verified && (
          <Card className="p-6 mb-6 bg-warning/10 border-warning">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center">
                <StatusBadge status={profile.verification_status} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Verification {profile.verification_status}</h3>
                <p className="text-sm text-muted-foreground">
                  {profile.verification_status === "pending"
                    ? "Your ID is being reviewed. You'll be able to connect with trip requests once verified."
                    : "Please upload your ID to get verified and start connecting with members."}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Button
            size="lg"
            className="h-20 text-lg bg-gradient-primary"
            onClick={() => navigate("/rider/create-request")}
            disabled={!(profile?.is_verified || profile?.verification_status === "approved")}
          >
            <Plus className="w-6 h-6 mr-2" />
            Post Trip Request
          </Button>
          <Button 
            size="lg" 
            variant="secondary" 
            className="h-20 text-lg"
            onClick={() => navigate("/trips")}
          >
            <Car className="w-6 h-6 mr-2" />
            Respond to Requests
          </Button>
          <Button 
            size="lg" 
            variant="outline" 
            className="h-20 text-lg"
            onClick={() => navigate("/profile")}
          >
            <User className="w-6 h-6 mr-2" />
            View Profile
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
                    {trip.rider && (
                      <div className="flex items-center gap-3 mb-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={trip.rider.photo_url || ""} alt={trip.rider.full_name || trip.rider.display_name || "Rider"} />
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                            {(trip.rider.full_name || trip.rider.display_name || trip.rider_id)[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <span className="block font-semibold text-sm">
                            {trip.rider.full_name || `User ${trip.rider_id?.slice(0, 8)}`}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            ID: {trip.rider_id?.slice(0, 8)}
                          </span>
                          <RatingDisplay 
                            rating={trip.rider.rider_rating_avg || 0} 
                            count={trip.rider.rider_rating_count || 0}
                            size="sm"
                          />
                        </div>
                      </div>
                    )}
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
        <div className="space-y-4">
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
                    {request.rider && (
                      <div className="flex items-center gap-3 mb-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={request.rider.photo_url || ""} alt={request.rider.full_name || request.rider.display_name || "Rider"} />
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                            {(request.rider.full_name || request.rider.display_name || request.rider_id)[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <span className="block font-semibold text-sm">
                            {request.rider.full_name || `User ${request.rider_id?.slice(0, 8)}`}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            ID: {request.rider_id?.slice(0, 8)}
                          </span>
                          <RatingDisplay 
                            rating={request.rider.rider_rating_avg || 0} 
                            count={request.rider.rider_rating_count || 0}
                            size="sm"
                          />
                        </div>
                      </div>
                    )}
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
                  <Button 
                    className="bg-gradient-primary" 
                    disabled={!(profile?.is_verified || profile?.verification_status === "approved")} 
                    onClick={() => handleAcceptClick(request)}
                  >
                    Connect
                  </Button>
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
