import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppHeader from "@/components/AppHeader";
import { MapPin, User, History, Activity, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import AcceptRideDialog from "@/components/AcceptRideDialog";
import TripActionDialog from "@/components/TripActionDialog";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { UserChip } from "@/components/UserChip";
import { DriverAvailability } from "@/components/DriverAvailability";
import { TripMap } from "@/components/TripMap";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { SubscriptionPanel } from "@/components/SubscriptionPanel";
import { TripLimitGate } from "@/components/TripLimitGate";
import { useToast } from "@/hooks/use-toast";

const DriverDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [myActiveTrips, setMyActiveTrips] = useState<any[]>([]);
  const [myCompletedTrips, setMyCompletedTrips] = useState<any[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [zipFilter, setZipFilter] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"open" | "connected" | "completed" | "availability">("open");
  const [selectedTrip, setSelectedTrip] = useState<any>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [action, setAction] = useState<"complete" | "cancel">("complete");
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user?.id).single();
      setProfile(data);
    };

    const fetchMyActiveTrips = async () => {
      const { data } = await supabase
        .from("ride_requests")
        .select("*, rider:profiles!rider_id(display_name, full_name, photo_url, rider_rating_avg, rider_rating_count, is_member)")
        .eq("assigned_driver_id", user?.id)
        .eq("status", "assigned")
        .order("updated_at", { ascending: false });
      
      setMyActiveTrips(data || []);
    };

    const fetchMyCompletedTrips = async () => {
      const { data } = await supabase
        .from("ride_requests")
        .select("*, rider:profiles!rider_id(display_name, full_name, photo_url, rider_rating_avg, rider_rating_count, is_member)")
        .eq("assigned_driver_id", user?.id)
        .eq("status", "completed")
        .order("updated_at", { ascending: false })
        .limit(10);
      
      setMyCompletedTrips(data || []);
    };

    const fetchRequests = async () => {
      let query = supabase
        .from("ride_requests")
        .select("*, rider:profiles!rider_id(display_name, full_name, photo_url, rider_rating_avg, rider_rating_count, is_member)")
        .eq("status", "open")
        .order("created_at", { ascending: false });

      if (zipFilter) {
        query = query.or(`pickup_zip.eq.${zipFilter},dropoff_zip.eq.${zipFilter}`);
      }

      const { data } = await query;
      setRequests(data || []);
    };

    const fetchAvailableDrivers = async () => {
      if (!profile?.current_zip) return;

      const { data } = await supabase
        .from("driver_status")
        .select("*, profiles!driver_status_user_id_fkey(id, display_name, full_name, photo_url, driver_rating_avg, driver_rating_count, is_verified, is_member)")
        .eq("state", "available")
        .not("current_zip", "is", null);
      
      setAvailableDrivers(data || []);
    };

    fetchProfile();
    fetchMyActiveTrips();
    fetchMyCompletedTrips();
    fetchRequests();
    fetchAvailableDrivers();

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
          fetchMyCompletedTrips();
          fetchRequests();
        }
      )
      .subscribe();

    // Subscribe to driver status changes
    const driverChannel = supabase
      .channel("driver_status_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "driver_status",
        },
        () => {
          fetchAvailableDrivers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(driverChannel);
    };
  }, [user, zipFilter, profile?.current_zip]);

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

  const handleCompleteTrip = (trip: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTrip(trip);
    setAction("complete");
    setActionDialogOpen(true);
  };

  const handleCancelTrip = (trip: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTrip(trip);
    setAction("cancel");
    setActionDialogOpen(true);
  };

  const handleSuccess = async () => {
    const fetchMyActiveTrips = async () => {
      const { data } = await supabase
        .from("ride_requests")
        .select("*, rider:profiles!rider_id(display_name, full_name, photo_url, rider_rating_avg, rider_rating_count, is_member)")
        .eq("assigned_driver_id", user?.id)
        .eq("status", "assigned")
        .order("updated_at", { ascending: false });
      
      setMyActiveTrips(data || []);
    };

    const fetchMyCompletedTrips = async () => {
      const { data } = await supabase
        .from("ride_requests")
        .select("*, rider:profiles!rider_id(display_name, full_name, photo_url, rider_rating_avg, rider_rating_count, is_member)")
        .eq("assigned_driver_id", user?.id)
        .eq("status", "completed")
        .order("updated_at", { ascending: false })
        .limit(10);
      
      setMyCompletedTrips(data || []);
    };

    await fetchMyActiveTrips();
    await fetchMyCompletedTrips();
    setSelectedTrip(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto px-4 py-8 max-w-6xl">
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

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <DriverAvailability />
          <SubscriptionPanel />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <Button
            variant="outline"
            className="h-auto py-3 sm:py-4 flex flex-col gap-2 border-2 border-primary/20 hover:border-primary hover:bg-primary/5 transition-all"
            onClick={() => setActiveTab("open")}
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
            onClick={() => setActiveTab("availability")}
          >
            <Activity className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <span className="text-xs sm:text-sm font-medium">Availability</span>
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-4 gap-1">
            <TabsTrigger value="open" className="text-xs sm:text-sm">Open</TabsTrigger>
            <TabsTrigger value="connected" className="text-xs sm:text-sm">Connected</TabsTrigger>
            <TabsTrigger value="completed" className="text-xs sm:text-sm">Completed</TabsTrigger>
            <TabsTrigger value="availability" className="text-xs sm:text-sm">Availability</TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="mt-6 space-y-4">
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

            <h2 className="text-2xl font-bold">Available Trip Requests ({filteredRequests.length})</h2>
            {filteredRequests.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No trip requests available matching your filters</p>
              </Card>
            ) : (
              filteredRequests.map((request) => (
                <Card key={request.id} className="p-4 sm:p-6 hover:shadow-lg transition-shadow">
                  <div className="flex flex-col gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <StatusBadge status={request.status} />
                        <span className="text-xs text-muted-foreground">
                          Requested at {format(new Date(request.created_at), "h:mm a")}
                        </span>
                      </div>
                      {request.rider && <UserChip userId={request.rider_id} displayName={request.rider.display_name} fullName={request.rider.full_name} photoUrl={request.rider.photo_url} role="rider" ratingAvg={request.rider.rider_rating_avg} ratingCount={request.rider.rider_rating_count} size="md" className="mb-3" />}
                      <div className="space-y-2 mb-4">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-success flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">Pickup</p>
                            <p className="text-sm text-muted-foreground break-words">{request.pickup_address}</p>
                            <p className="text-xs text-muted-foreground">Zip: {request.pickup_zip}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-destructive flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">Dropoff</p>
                            <p className="text-sm text-muted-foreground break-words">{request.dropoff_address}</p>
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
          </TabsContent>

          <TabsContent value="connected" className="mt-6 space-y-4">
            <h2 className="text-2xl font-bold">My Connected Trips ({myActiveTrips.length})</h2>
            {myActiveTrips.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No active trips. Check the Open tab to find rides!</p>
              </Card>
            ) : (
              myActiveTrips.map((trip) => (
                <Card 
                  key={trip.id} 
                  className="p-4 sm:p-6 border-2 border-primary hover:shadow-glow transition-all bg-gradient-to-br from-card to-primary/5"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex-1 cursor-pointer" onClick={() => navigate(`/trip/${trip.id}`)}>
                      <div className="flex items-center gap-2 mb-2">
                        <StatusBadge status={trip.status} />
                        <span className="text-xs text-muted-foreground">
                          Connected at {format(new Date(trip.updated_at), "h:mm a")}
                        </span>
                      </div>
                      {trip.rider && <UserChip userId={trip.rider_id} displayName={trip.rider.display_name} fullName={trip.rider.full_name} photoUrl={trip.rider.photo_url} role="rider" ratingAvg={trip.rider.rider_rating_avg} ratingCount={trip.rider.rider_rating_count} size="md" className="mb-3" />}
                      <div className="space-y-2 mb-4">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-success flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">Pickup</p>
                            <p className="text-sm text-muted-foreground break-words">{trip.pickup_address}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-destructive flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">Dropoff</p>
                            <p className="text-sm text-muted-foreground break-words">{trip.dropoff_address}</p>
                          </div>
                        </div>
                      </div>
                      {trip.price_offer && (
                        <p className="text-lg font-semibold text-primary">
                          Price: ${trip.price_offer}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 w-full">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={(e) => handleCompleteTrip(trip, e)}
                        className="flex-1"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Complete
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handleCancelTrip(trip, e)}
                        className="flex-1"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-6 space-y-4">
            <h2 className="text-2xl font-bold">Completed Trips</h2>
            {myCompletedTrips.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No completed trips yet</p>
              </Card>
            ) : (
              myCompletedTrips.map((trip) => (
                <Card key={trip.id} className="p-4 sm:p-6 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate(`/trip/${trip.id}`)}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <StatusBadge status={trip.status} />
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(trip.updated_at), "MMM d, yyyy")}
                        </span>
                      </div>
                      {trip.rider && <UserChip userId={trip.rider_id} displayName={trip.rider.display_name} fullName={trip.rider.full_name} photoUrl={trip.rider.photo_url} role="rider" ratingAvg={trip.rider.rider_rating_avg} ratingCount={trip.rider.rider_rating_count} size="sm" className="mb-2" />}
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-success flex-shrink-0" />
                          <p className="text-sm break-words flex-1 min-w-0">{trip.pickup_address}</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-destructive flex-shrink-0" />
                          <p className="text-sm break-words flex-1 min-w-0">{trip.dropoff_address}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="availability" className="mt-6 space-y-6">
            <DriverAvailability />
            
            {profile?.current_zip && availableDrivers.length > 0 && (
              <>
                <h3 className="text-xl font-semibold">Nearby Drivers on Map</h3>
                <TripMap
                  markers={availableDrivers
                    .filter(d => d.profiles && d.current_zip)
                    .map(d => ({
                      id: d.user_id,
                      zip: d.current_zip,
                      title: d.profiles.full_name || d.profiles.display_name || 'Driver',
                      description: `Rating: ${d.profiles.driver_rating_avg?.toFixed(1) || 'N/A'} ⭐`,
                      type: 'driver' as const,
                    }))}
                  centerZip={profile.current_zip}
                />
              </>
            )}
          </TabsContent>
        </Tabs>

        {selectedRequest && (
          <AcceptRideDialog
            request={selectedRequest}
            open={acceptDialogOpen}
            onOpenChange={setAcceptDialogOpen}
            driverId={user?.id || ""}
          />
        )}

        {selectedTrip && (
          <TripActionDialog
            request={selectedTrip}
            open={actionDialogOpen}
            onOpenChange={setActionDialogOpen}
            action={action}
            userRole="driver"
            onSuccess={handleSuccess}
          />
        )}
      </div>
    </div>
  );
};

export default DriverDashboard;
