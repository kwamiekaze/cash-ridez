import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { TripMap } from "@/components/TripMap";
import { useDriverAvailabilitySync } from "@/hooks/useDriverAvailabilitySync";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppHeader from "@/components/AppHeader";
import { Car, LogOut, Plus, User, History, MapPin, Clock, CheckCircle, XCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { format } from "date-fns";
import StatusBadge from "@/components/StatusBadge";
import { UserChip } from "@/components/UserChip";
import { RatingDisplay } from "@/components/RatingDisplay";
import { useToast } from "@/hooks/use-toast";
import TripActionDialog from "@/components/TripActionDialog";
import { AvailableDriversList } from "@/components/AvailableDriversList";
import { SubscriptionPanel } from "@/components/SubscriptionPanel";
import { TripLimitGate } from "@/components/TripLimitGate";
import { MapBackground } from "@/components/MapBackground";
import { CommunityChat } from "@/components/CommunityChat";

const RiderDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"open" | "assigned" | "completed" | "chat">("open");
  const [requests, setRequests] = useState<any[]>([]);
  const [initialTabSet, setInitialTabSet] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<any>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [action, setAction] = useState<"complete" | "cancel">("complete");
  
  // Sync driver availability with notifications
  useDriverAvailabilitySync();

  // Check URL params for tab navigation
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['open', 'assigned', 'completed', 'chat'].includes(tabParam)) {
      setActiveTab(tabParam as any);
    }
  }, [location.search]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", user?.id).single();
      setProfile(data);
      
      // Check if user has active_role set to driver - if so, redirect to trips
      if (data?.active_role === 'driver') {
        navigate('/trips');
        toast({
          title: "Redirected",
          description: "You're set as a driver. Access rider features from your profile.",
        });
      }
    };

    const fetchRequests = async () => {
      if (!user) return;
      // Rider dashboard should ONLY show trips where user is the rider
      const { data, error } = await supabase
        .from("ride_requests")
        .select("*")
        .eq("rider_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (error) {
        console.error("Error fetching requests:", error);
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }

      // Fetch driver profiles for requests that have assigned drivers
      if (data && data.length > 0) {
        const driverIds = data
          .map(r => r.assigned_driver_id)
          .filter((id): id is string => id !== null);

        if (driverIds.length > 0) {
          const { data: driverProfiles } = await supabase
            .from("profiles")
            .select("id, display_name, driver_rating_avg, driver_rating_count, photo_url, is_member")
            .in("id", driverIds);

          // Merge driver data into requests
          const enrichedData = data.map(request => ({
            ...request,
            assigned_driver: request.assigned_driver_id 
              ? driverProfiles?.find(p => p.id === request.assigned_driver_id) 
              : null
          }));

          // Sort: assigned trips first, then open, then by date
          const sortedData = enrichedData.sort((a, b) => {
            // Priority: assigned > open > completed/cancelled
            const statusPriority: Record<string, number> = {
              assigned: 0,
              open: 1,
              completed: 2,
              cancelled: 3
            };
            
            const priorityDiff = (statusPriority[a.status] || 999) - (statusPriority[b.status] || 999);
            if (priorityDiff !== 0) return priorityDiff;
            
            // Within same status, sort by most recent
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });

          setRequests(sortedData);
        } else {
          // Sort even without driver profiles
          const sortedData = data.sort((a, b) => {
            const statusPriority: Record<string, number> = {
              assigned: 0,
              open: 1,
              completed: 2,
              cancelled: 3
            };
            
            const priorityDiff = (statusPriority[a.status] || 999) - (statusPriority[b.status] || 999);
            if (priorityDiff !== 0) return priorityDiff;
            
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          
          setRequests(sortedData);
        }
      } else {
        setRequests([]);
      }
    };

    fetchProfile();
    fetchRequests();

    // Subscribe to changes
    const channel = supabase
      .channel("rider_requests_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ride_requests",
          filter: `rider_id=eq.${user?.id}` // Note: realtime only supports single column filters
        },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Auto-select the appropriate tab based on active trips (PRIORITY: assigned > open)
  useEffect(() => {
    if (!initialTabSet && requests.length > 0) {
      const hasAssignedTrips = requests.some(r => r.status === "assigned");
      const hasOpenTrips = requests.some(r => r.status === "open");
      
      if (hasAssignedTrips) {
        setActiveTab("assigned");
      } else if (hasOpenTrips) {
        setActiveTab("open");
      }
      
      setInitialTabSet(true);
    }
  }, [requests, initialTabSet]);

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
    if (!user) return;
    
    // Refresh the requests list
    const { data, error } = await supabase
      .from("ride_requests")
      .select("*")
      .eq("rider_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    
    if (error) {
      console.error("Error fetching requests:", error);
      return;
    }

    // Fetch driver profiles for requests that have assigned drivers
    if (data && data.length > 0) {
      const driverIds = data
        .map(r => r.assigned_driver_id)
        .filter((id): id is string => id !== null);

      if (driverIds.length > 0) {
        const { data: driverProfiles } = await supabase
          .from("profiles")
          .select("id, display_name, driver_rating_avg, driver_rating_count, photo_url")
          .in("id", driverIds);

        // Merge driver data into requests
        const enrichedData = data.map(request => ({
          ...request,
          assigned_driver: request.assigned_driver_id 
            ? driverProfiles?.find(p => p.id === request.assigned_driver_id) 
            : null
        }));

        // Sort: assigned trips first, then open, then by date
        const sortedData = enrichedData.sort((a, b) => {
          const statusPriority: Record<string, number> = {
            assigned: 0,
            open: 1,
            completed: 2,
            cancelled: 3
          };
          
          const priorityDiff = (statusPriority[a.status] || 999) - (statusPriority[b.status] || 999);
          if (priorityDiff !== 0) return priorityDiff;
          
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        setRequests(sortedData);
      } else {
        const sortedData = data.sort((a, b) => {
          const statusPriority: Record<string, number> = {
            assigned: 0,
            open: 1,
            completed: 2,
            cancelled: 3
          };
          
          const priorityDiff = (statusPriority[a.status] || 999) - (statusPriority[b.status] || 999);
          if (priorityDiff !== 0) return priorityDiff;
          
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        
        setRequests(sortedData);
      }
    } else {
      setRequests([]);
    }
    
    setSelectedTrip(null);
  };

  // Refresh requests when navigating back from creating a new one
  useEffect(() => {
    if (location.state?.refreshRequests && user) {
      console.log("Refreshing requests from location state");
      const fetchRequests = async () => {
      // Rider dashboard should ONLY show trips where user is the rider
        const { data, error } = await supabase
          .from("ride_requests")
          .select("*")
          .eq("rider_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);
        
        if (error) {
          console.error("Error fetching requests:", error);
          return;
        }

        console.log("Fetched requests:", data);

        // Fetch driver profiles for requests that have assigned drivers
        if (data && data.length > 0) {
          const driverIds = data
            .map(r => r.assigned_driver_id)
            .filter((id): id is string => id !== null);

          if (driverIds.length > 0) {
            const { data: driverProfiles } = await supabase
              .from("profiles")
              .select("id, display_name, driver_rating_avg, driver_rating_count, photo_url")
              .in("id", driverIds);

            // Merge driver data into requests
            const enrichedData = data.map(request => ({
              ...request,
              assigned_driver: request.assigned_driver_id 
                ? driverProfiles?.find(p => p.id === request.assigned_driver_id) 
                : null
            }));

            // Sort: assigned trips first, then open, then by date
            const sortedData = enrichedData.sort((a, b) => {
              const statusPriority: Record<string, number> = {
                assigned: 0,
                open: 1,
                completed: 2,
                cancelled: 3
              };
              
              const priorityDiff = (statusPriority[a.status] || 999) - (statusPriority[b.status] || 999);
              if (priorityDiff !== 0) return priorityDiff;
              
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });

            setRequests(sortedData);
          } else {
            const sortedData = data.sort((a, b) => {
              const statusPriority: Record<string, number> = {
                assigned: 0,
                open: 1,
                completed: 2,
                cancelled: 3
              };
              
              const priorityDiff = (statusPriority[a.status] || 999) - (statusPriority[b.status] || 999);
              if (priorityDiff !== 0) return priorityDiff;
              
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
            
            setRequests(sortedData);
          }
        } else {
          setRequests([]);
        }
      };
      fetchRequests();
      // Clear the state to prevent repeated fetches
      window.history.replaceState({}, document.title);
    }
  }, [location.state?.timestamp, user]);

  return (
    <div className="min-h-screen bg-background relative">
      {/* Animated Map Background */}
      <MapBackground showAnimatedCar showRiders intensity="subtle" className="fixed inset-0 z-0" />
      
      <div className="relative z-10">
        <AppHeader />

      <div className="container mx-auto px-4 py-8">
        {/* Verification Notice */}
        {profile && !(profile.is_verified || profile.verification_status === "approved") && (
          <Card className="p-6 mb-6 bg-warning/10 border-warning">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center">
                <StatusBadge status={profile.verification_status} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Verification {profile.verification_status}</h3>
                <p className="text-sm text-muted-foreground">
                  {profile.verification_status === "pending"
                    ? "Your ID is being reviewed. You'll be able to post trips once verified."
                    : "Please upload your ID to get verified and start posting trips."}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Quick Actions */}
        <div className={`grid grid-cols-1 gap-4 mb-8 ${profile?.active_role !== 'rider' ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          <TripLimitGate
            action="create trip request"
            onProceed={() => navigate("/rider/create-request")}
          >
            <Button
              size="lg"
              className="h-20 text-lg bg-gradient-primary hover:opacity-90 transition-opacity shadow-lg w-full"
              disabled={!(profile?.is_verified || profile?.verification_status === "approved")}
            >
              <Plus className="w-6 h-6 mr-2" />
              Post Trip Request
            </Button>
          </TripLimitGate>
          {profile?.active_role !== 'rider' && (
            <Button 
              size="lg" 
              variant="secondary" 
              className="h-20 text-lg"
              onClick={() => navigate("/trips")}
            >
              <Car className="w-6 h-6 mr-2" />
              Respond to Requests
            </Button>
          )}
          <Button 
            size="lg" 
            variant="secondary" 
            className="h-20 text-lg"
            onClick={() => navigate("/profile")}
          >
            <User className="w-6 h-6 mr-2" />
            View Profile
          </Button>
        </div>

        {/* Subscription Panel */}
        <div className="mb-8">
          <SubscriptionPanel />
        </div>

        {/* Trips Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "open" | "assigned" | "completed" | "chat")} className="w-full">
          <TabsList className="grid w-full grid-cols-4 gap-1">
            <TabsTrigger value="open" className="text-xs sm:text-sm">Open</TabsTrigger>
            <TabsTrigger value="assigned" className="text-xs sm:text-sm">Connected</TabsTrigger>
            <TabsTrigger value="completed" className="text-xs sm:text-sm">Completed</TabsTrigger>
            <TabsTrigger value="chat" className="text-xs sm:text-sm">💬 Chat</TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="mt-6 space-y-4">
            {requests.filter(r => r.status === "open").length === 0 ? (
              <Card className="p-12 text-center bg-gradient-to-br from-card to-muted/20">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <MapPin className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Open Trips</h3>
                <p className="text-muted-foreground mb-6">Start your journey by creating a trip request</p>
                <TripLimitGate
                  action="create trip request"
                  onProceed={() => navigate("/rider/create-request")}
                >
                  <Button className="bg-gradient-primary hover:opacity-90">
                    {requests.length > 0 ? "Create New Trip Request" : "Create Your First Trip Request"}
                  </Button>
                </TripLimitGate>
              </Card>
            ) : (
              requests.filter(r => r.status === "open").map(request => (
                <Card key={request.id} className="p-4 sm:p-6 hover:shadow-xl hover:border-primary/50 transition-all duration-200 bg-gradient-to-br from-card to-card/50">
                  <div className="flex flex-col gap-4">
                    <div className="flex-1 cursor-pointer" onClick={() => navigate(`/trip/${request.id}`)}>
                      <div className="flex items-center gap-2 mb-2">
                        <StatusBadge status={request.status} />
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-success flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">Pickup</p>
                            <p className="text-sm text-muted-foreground break-words">{request.pickup_address}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-destructive flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">Dropoff</p>
                            <p className="text-sm text-muted-foreground break-words">{request.dropoff_address}</p>
                          </div>
                        </div>
                      </div>
                      {request.price_offer && (
                        <p className="text-lg font-semibold text-primary mt-2">
                          Offered: ${request.price_offer}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 w-full">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={(e) => handleCancelTrip(request, e)}
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

          <TabsContent value="assigned" className="mt-6 space-y-4">
            {requests.filter(r => r.status === "assigned").length === 0 ? (
              <Card className="p-12 text-center bg-gradient-to-br from-card to-muted/20">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <Car className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Connected Trips</h3>
                <p className="text-muted-foreground">Your active trips will appear here</p>
              </Card>
            ) : (
              requests.filter(r => r.status === "assigned").map(request => (
                <Card key={request.id} className="p-4 sm:p-6 hover:shadow-xl hover:border-primary/50 transition-all duration-200 bg-gradient-to-br from-card to-primary/5 border-2">
                  <div className="flex flex-col gap-4">
                    <div className="flex-1 cursor-pointer" onClick={() => navigate(`/trip/${request.id}`)}>
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <StatusBadge status={request.status} />
                        {request.assigned_driver && (
                          <UserChip
                            userId={request.assigned_driver_id}
                            displayName={request.assigned_driver.display_name}
                            fullName={request.assigned_driver.full_name}
                            photoUrl={request.assigned_driver.photo_url}
                            role="driver"
                            ratingAvg={request.assigned_driver.driver_rating_avg}
                            ratingCount={request.assigned_driver.driver_rating_count}
                            size="sm"
                          />
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-success flex-shrink-0" />
                          <p className="text-sm break-words flex-1 min-w-0">{request.pickup_address}</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-destructive flex-shrink-0" />
                          <p className="text-sm break-words flex-1 min-w-0">{request.dropoff_address}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 w-full">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={(e) => handleCompleteTrip(request, e)}
                        className="flex-1"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Complete
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={(e) => handleCancelTrip(request, e)}
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
            {requests.filter(r => r.status === "completed").length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No completed trips yet</p>
              </Card>
            ) : (
              requests.filter(r => r.status === "completed").map(request => (
                <Card key={request.id} className="p-6 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate(`/trip/${request.id}`)}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <StatusBadge status={request.status} />
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(request.updated_at), "MMM d, yyyy")}
                        </span>
                      </div>
                      {request.assigned_driver && (
                        <UserChip
                          userId={request.assigned_driver_id}
                          displayName={request.assigned_driver.display_name}
                          photoUrl={request.assigned_driver.photo_url}
                          role="driver"
                          ratingAvg={request.assigned_driver.driver_rating_avg}
                          ratingCount={request.assigned_driver.driver_rating_count}
                          size="sm"
                          className="mb-2"
                        />
                      )}
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-success" />
                          <p className="text-sm">{request.pickup_address}</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-destructive" />
                          <p className="text-sm">{request.dropoff_address}</p>
                        </div>
                      </div>
                      {request.rider_id === user?.id && request.driver_rating && (
                        <div className="mt-2 text-sm">
                          <span className="text-muted-foreground">Your rating: </span>
                          <RatingDisplay rating={request.driver_rating} count={0} size="sm" showCount={false} />
                        </div>
                      )}
                      {request.assigned_driver_id === user?.id && request.rider_rating && (
                        <div className="mt-2 text-sm">
                          <span className="text-muted-foreground">Your rating: </span>
                          <RatingDisplay rating={request.rider_rating} count={0} size="sm" showCount={false} />
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="chat" className="mt-6 space-y-6">
            <CommunityChat />
          </TabsContent>
        </Tabs>
      </div>

      {selectedTrip && (
        <TripActionDialog
          request={selectedTrip}
          open={actionDialogOpen}
          onOpenChange={setActionDialogOpen}
          action={action}
          userRole="rider"
          onSuccess={handleSuccess}
        />
      )}
      </div>
    </div>
  );
};

export default RiderDashboard;
