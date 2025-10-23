import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { TripMap } from "@/components/TripMap";
import { EnhancedTripMap } from "@/components/EnhancedTripMap";
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

const RiderDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"open" | "assigned" | "completed" | "map">("open");
  const [requests, setRequests] = useState<any[]>([]);
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);
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
    if (tabParam && ['open', 'assigned', 'completed', 'map'].includes(tabParam)) {
      setActiveTab(tabParam as any);
    }
  }, [location.search]);

  // Load available drivers for map
  useEffect(() => {
    if (user && activeTab === 'map') {
      loadAvailableDriversForMap();
    }
  }, [user, activeTab]);

  const loadAvailableDriversForMap = async () => {
    try {
      const { data: driverStatuses } = await supabase
        .from('driver_status')
        .select('*')
        .eq('state', 'available');

      if (driverStatuses && driverStatuses.length > 0) {
        const driverIds = driverStatuses.map(d => d.user_id);
        const [profilesResult, cancelStatsResult] = await Promise.all([
          supabase.from('profiles').select('id, full_name, display_name, driver_rating_avg, driver_rating_count, photo_url, is_member, is_verified').in('id', driverIds),
          supabase.from('cancellation_stats').select('user_id, driver_rate_90d').in('user_id', driverIds)
        ]);

        const enriched = driverStatuses.map(status => {
          const profile = profilesResult.data?.find(p => p.id === status.user_id);
          const cancelData = cancelStatsResult.data?.find(c => c.user_id === status.user_id);
          return { ...status, ...profile, cancelRate: cancelData?.driver_rate_90d || 0 };
        });
        setAvailableDrivers(enriched);
      }
    } catch (error) {
      console.error('Error loading drivers for map:', error);
    }
  };

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
        .eq("rider_id", user.id);
      
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
            .select("id, display_name, full_name, photo_url, rider_rating_avg, rider_rating_count, is_member")
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
      .channel("ride_requests_changes")
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
      .eq("rider_id", user.id);
    
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
          .eq("rider_id", user.id);
        
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

  const renderTripCard = (request: any) => (
    <Card key={request.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/trip/${request.id}`)}>
      <div className="space-y-3">
        <div className="flex justify-between items-start gap-2">
          <StatusBadge status={request.status} />
          <span className="text-xs text-muted-foreground">{format(new Date(request.created_at), "MMM d, yyyy")}</span>
        </div>
        {request.assigned_driver && (
          <UserChip userId={request.assigned_driver.id} fullName={request.assigned_driver.display_name} displayName={request.assigned_driver.display_name} photoUrl={request.assigned_driver.photo_url} role="driver" ratingAvg={request.assigned_driver.driver_rating_avg} ratingCount={request.assigned_driver.driver_rating_count} size="md" />
        )}
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-success mt-0.5" /><p>{request.pickup_address}</p></div>
          <div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-destructive mt-0.5" /><p>{request.dropoff_address}</p></div>
          {request.price_offer && <p className="text-green-600 font-semibold">${request.price_offer}</p>}
        </div>
        {(request.status === "open" || request.status === "assigned") && (
          <div className="flex gap-2 pt-2 border-t">
            {request.status === "assigned" && (<Button size="sm" variant="default" className="flex-1" onClick={(e) => { e.stopPropagation(); setSelectedTrip(request); setAction("complete"); setActionDialogOpen(true); }}><CheckCircle className="h-4 w-4 mr-1" />Complete</Button>)}
            <Button size="sm" variant="destructive" className="flex-1" onClick={(e) => { e.stopPropagation(); setSelectedTrip(request); setAction("cancel"); setActionDialogOpen(true); }}><XCircle className="h-4 w-4 mr-1" />Cancel</Button>
          </div>
        )}
      </div>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto px-4 py-8">
        {profile && !(profile.is_verified || profile.verification_status === "approved") && (
          <Card className="p-6 mb-6 bg-warning/10 border-warning">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center"><StatusBadge status={profile.verification_status} /></div>
              <div className="flex-1"><h3 className="font-semibold mb-1">Verification {profile.verification_status}</h3><p className="text-sm text-muted-foreground">{profile.verification_status === "pending" ? "Your ID is being reviewed. You'll be able to post trips once verified." : "Please upload your ID to get verified and start posting trips."}</p></div>
            </div>
          </Card>
        )}
        <div className={`grid grid-cols-1 gap-4 mb-8 ${profile?.active_role !== 'rider' ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          <TripLimitGate action="create trip request" onProceed={() => navigate("/rider/create-request")}>
            <Button size="lg" className="h-20 text-lg bg-gradient-primary hover:opacity-90 transition-opacity shadow-lg w-full" disabled={!(profile?.is_verified || profile?.verification_status === "approved")}><Plus className="w-6 h-6 mr-2" />Post Trip Request</Button>
          </TripLimitGate>
          {profile?.active_role !== 'rider' && (<Button size="lg" variant="secondary" className="h-20 text-lg" onClick={() => navigate("/trips")}><Car className="w-6 h-6 mr-2" />Respond to Requests</Button>)}
          <Button size="lg" variant="outline" className="h-20 text-lg hover:bg-accent transition-colors" onClick={() => navigate("/profile")}><User className="w-6 h-6 mr-2" />View Profile</Button>
        </div>
        <div className="mb-8"><SubscriptionPanel /></div>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "open" | "assigned" | "completed" | "map")} className="w-full">
          <TabsList className="grid w-full grid-cols-4 gap-1">
            <TabsTrigger value="open" className="text-xs sm:text-sm">Open</TabsTrigger>
            <TabsTrigger value="assigned" className="text-xs sm:text-sm">Connected</TabsTrigger>
            <TabsTrigger value="completed" className="text-xs sm:text-sm">Completed</TabsTrigger>
            <TabsTrigger value="map" className="text-xs sm:text-sm">Map</TabsTrigger>
          </TabsList>
          <TabsContent value="open" className="mt-6 space-y-4">{requests.filter(r => r.status === "open").length === 0 ? (<Card className="p-12 text-center bg-gradient-to-br from-card to-muted/20"><p className="text-muted-foreground">No open trip requests</p></Card>) : requests.filter(r => r.status === "open").map(renderTripCard)}</TabsContent>
          <TabsContent value="assigned" className="mt-6 space-y-4">{requests.filter(r => r.status === "assigned").length === 0 ? (<Card className="p-12 text-center"><p className="text-muted-foreground">No connected trips</p></Card>) : requests.filter(r => r.status === "assigned").map(renderTripCard)}</TabsContent>
          <TabsContent value="completed" className="mt-6 space-y-4">{requests.filter(r => r.status === "completed" || r.status === "cancelled").length === 0 ? (<Card className="p-12 text-center"><p className="text-muted-foreground">No completed trips</p></Card>) : requests.filter(r => r.status === "completed" || r.status === "cancelled").map((request) => (<Card key={request.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/trip/${request.id}`)}><div className="space-y-3"><div className="flex justify-between items-center"><StatusBadge status={request.status} /><span className="text-xs text-muted-foreground">{format(new Date(request.created_at), "MMM d, yyyy")}</span></div>{request.assigned_driver && (<UserChip userId={request.assigned_driver.id} fullName={request.assigned_driver.display_name} displayName={request.assigned_driver.display_name} photoUrl={request.assigned_driver.photo_url} role="driver" ratingAvg={request.assigned_driver.driver_rating_avg} ratingCount={request.assigned_driver.driver_rating_count} size="sm" className="mb-2" />)}<div className="space-y-2"><div className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-1 text-success" /><p className="text-sm">{request.pickup_address}</p></div><div className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-1 text-destructive" /><p className="text-sm">{request.dropoff_address}</p></div></div>{request.rider_id === user?.id && request.driver_rating && (<div className="mt-2 text-sm"><span className="text-muted-foreground">Your rating: </span><RatingDisplay rating={request.driver_rating} count={0} size="sm" showCount={false} /></div>)}{request.assigned_driver_id === user?.id && request.rider_rating && (<div className="mt-2 text-sm"><span className="text-muted-foreground">Your rating: </span><RatingDisplay rating={request.rider_rating} count={0} size="sm" showCount={false} /></div>)}</div></Card>))}</TabsContent>
          <TabsContent value="map" className="mt-6 space-y-6">
            {profile?.profile_zip && (
              <EnhancedTripMap
                markers={[
                  ...requests.filter(r => r.status === 'open').map(r => ({
                    id: r.id, zip: r.pickup_zip, title: `Trip Request`, description: `${r.pickup_address} → ${r.dropoff_address}`, type: 'trip' as const,
                  })),
                  ...availableDrivers.map(d => ({
                    id: d.user_id, zip: d.current_zip, title: d.full_name || 'Driver', description: '', type: 'driver' as const,
                    photoUrl: d.photo_url, fullName: d.full_name, rating: d.driver_rating_avg, ratingCount: d.driver_rating_count,
                    cancelRate: d.cancelRate, isVerified: d.is_verified, isMember: d.is_member, status: d.state, approxGeo: d.approx_geo
                  }))
                ]}
                centerZip={profile.profile_zip}
              />
            )}
            <AvailableDriversList />
          </TabsContent>
        </Tabs>
      </div>
      {selectedTrip && (<TripActionDialog request={selectedTrip} open={actionDialogOpen} onOpenChange={setActionDialogOpen} action={action} />)}
    </div>
  );
};

export default RiderDashboard;

