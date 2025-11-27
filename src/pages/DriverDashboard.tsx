import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Calendar, Clock, DollarSign, MessageSquare, CheckCircle, XCircle, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import AppHeader from "@/components/AppHeader";
import { UserChip } from "@/components/UserChip";
import { useAuth } from "@/contexts/AuthContext";
import { TripMap } from "@/components/TripMap";
import { MapBackground } from "@/components/MapBackground";
import { CommunityChat } from "@/components/CommunityChat";
import FloatingSupport from "@/components/FloatingSupport";
import { FloatingChat } from "@/components/FloatingChat";
import { DashboardCar } from "@/components/DashboardCar";
import { useSubscription } from "@/hooks/useSubscription";
import { MaskedCallButton } from "@/components/MaskedCallButton";

const DriverDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { startCheckout } = useSubscription();
  const [openRequests, setOpenRequests] = useState<any[]>([]);
  const [connectedRequests, setConnectedRequests] = useState<any[]>([]);
  const [completedRequests, setCompletedRequests] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("open");
  const [profile, setProfile] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "highest_payout" | "highest_rated">("newest");

  useEffect(() => {
    if (user) {
      fetchRequests();
      fetchProfile();
      
      // Set up realtime subscription for profile updates
      const profileChannel = supabase
        .channel('driver-profile-changes')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`
          },
          (payload) => {
            console.log("Driver profile updated via realtime:", payload.new);
            setProfile(payload.new);
          }
        )
        .subscribe();
      
      return () => {
        profileChannel.unsubscribe();
      };
    }

    // Set tab from URL parameter
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [user, searchParams]);

  const fetchProfile = async () => {
    if (!user) return;
    
    // Force fresh fetch with explicit column selection
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, display_name, completed_trips_count, free_uses_remaining, subscription_active, is_verified, verification_status, active_role, paused, blocked, photo_url, rider_rating_avg, rider_rating_count, driver_rating_avg, driver_rating_count, is_driver, is_rider, phone_number, car_make, car_model, car_year")
      .eq("id", user.id)
      .single();
    
    if (error) {
      console.error("Error fetching driver profile:", error);
      return;
    }
    
    console.log("✅ Driver profile data fetched:", { 
      id: data?.id,
      completed_trips_count: data?.completed_trips_count,
      free_uses_remaining: data?.free_uses_remaining,
      full_data: data
    });
    
    setProfile(data);
  };

  const fetchRequests = async () => {
    try {
      // Fetch open requests
      const { data: openData } = await supabase
        .from("ride_requests")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(100);

      if (openData) {
        const riderIds = openData.map(r => r.rider_id);
        const { data: riderProfiles } = await supabase
          .from("profiles")
          .select("id, display_name, full_name, photo_url, rider_rating_avg, rider_rating_count, is_member")
          .in("id", riderIds);

        const enrichedOpen = openData.map(request => ({
          ...request,
          rider: riderProfiles?.find(p => p.id === request.rider_id)
        }));

        setOpenRequests(enrichedOpen);
      }

      // Fetch connected (assigned) requests - exclude trips driver has rated
      const { data: connectedData } = await supabase
        .from("ride_requests")
        .select("*")
        .eq("assigned_driver_id", user?.id)
        .eq("status", "assigned")
        .is("driver_rating", null)
        .order("updated_at", { ascending: false });

      if (connectedData) {
        const riderIds = connectedData.map(r => r.rider_id);
        const { data: riderProfiles } = await supabase
          .from("profiles")
          .select("id, display_name, full_name, photo_url, rider_rating_avg, rider_rating_count, is_member")
          .in("id", riderIds);

        const enrichedConnected = connectedData.map(request => ({
          ...request,
          rider: riderProfiles?.find(p => p.id === request.rider_id)
        }));

        setConnectedRequests(enrichedConnected);
      }

      // Fetch completed requests - include trips driver has rated OR status is completed
      const { data: completedData } = await supabase
        .from("ride_requests")
        .select("*")
        .eq("assigned_driver_id", user?.id)
        .or("status.eq.completed,driver_rating.not.is.null")
        .order("updated_at", { ascending: false })
        .limit(20);

      if (completedData) {
        const riderIds = completedData.map(r => r.rider_id);
        const { data: riderProfiles } = await supabase
          .from("profiles")
          .select("id, display_name, full_name, photo_url, rider_rating_avg, rider_rating_count, is_member")
          .in("id", riderIds);

        const enrichedCompleted = completedData.map(request => ({
          ...request,
          rider: riderProfiles?.find(p => p.id === request.rider_id)
        }));

        setCompletedRequests(enrichedCompleted);
      }
    } catch (error: any) {
      console.error("Error fetching requests:", error);
      toast.error("Failed to load trips");
    }
  };

  // Filter and sort open requests
  const filteredOpenRequests = useMemo(() => {
    let filtered = [...openRequests];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(request => {
        const pickupMatch = request.pickup_address?.toLowerCase().includes(query);
        const dropoffMatch = request.dropoff_address?.toLowerCase().includes(query);
        const pickupZipMatch = request.pickup_zip?.toLowerCase().includes(query);
        const dropoffZipMatch = request.dropoff_zip?.toLowerCase().includes(query);
        const riderNameMatch = request.rider?.display_name?.toLowerCase().includes(query) || 
                               request.rider?.full_name?.toLowerCase().includes(query);
        return pickupMatch || dropoffMatch || pickupZipMatch || dropoffZipMatch || riderNameMatch;
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "highest_payout":
          return (b.price_offer || 0) - (a.price_offer || 0);
        case "highest_rated":
          const aRating = a.rider?.rider_rating_avg || 0;
          const bRating = b.rider?.rider_rating_avg || 0;
          return bRating - aRating;
        default:
          return 0;
      }
    });

    return filtered;
  }, [openRequests, searchQuery, sortBy]);

  const renderTripCard = (request: any) => {
    const isCompleted = request.status === "completed";
    const hasDriverRated = request.driver_rating !== null;
    
    return (
      <Card
        key={request.id}
        className="p-4 sm:p-6 hover:shadow-lg transition-all duration-200 cursor-pointer border-2"
        onClick={() => navigate(`/trip/${request.id}`)}
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant={request.status === "open" ? "default" : request.status === "assigned" ? "secondary" : "outline"}>
                  {request.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(request.created_at).toLocaleDateString()}
                </span>
              </div>

              {request.rider && (
                <div className="mb-3">
                  <UserChip
                    userId={request.rider.id}
                    fullName={request.rider.full_name}
                    displayName={request.rider.display_name}
                    photoUrl={request.rider.photo_url}
                    role="rider"
                    ratingAvg={request.rider.rider_rating_avg}
                    ratingCount={request.rider.rider_rating_count}
                    size="md"
                  />
                </div>
              )}

              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">From: {request.pickup_address}</p>
                    <p className="text-muted-foreground">To: {request.dropoff_address}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <p className="text-muted-foreground">
                    {new Date(request.pickup_time).toLocaleString()}
                  </p>
                </div>
                {request.price_offer && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <p className="font-semibold text-green-600">${request.price_offer}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {!hasDriverRated && !isCompleted && (
            <div className="flex gap-1.5 pt-4 border-t">
              <Button
                size="sm"
                variant="secondary"
                className="flex-1 h-9 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/chat/${request.id}`);
                }}
              >
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                Chat
              </Button>
              <MaskedCallButton
                tripId={request.id}
                userRole="driver"
                tripStatus={request.status}
              />
              <Button
                size="sm"
                className="flex-1 h-9 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/trip/${request.id}`);
                }}
              >
                View Details
              </Button>
            </div>
          )}

          {(hasDriverRated || isCompleted) && (
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2 text-sm">
                {request.driver_rating ? (
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-green-600 font-medium">You Rated</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Not rated</span>
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/trip/${request.id}`);
                }}
              >
                View Details
              </Button>
            </div>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background relative">
      {/* Animated Map Background */}
      <MapBackground showAnimatedCar showRiders intensity="subtle" className="fixed inset-0 z-0" />
      
      <div className="relative z-10">
        <AppHeader showCar={false} />
        <DashboardCar />
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">My Trips</h1>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="connected">Connected</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="chat">💬 Chat</TabsTrigger>
            </TabsList>

          <TabsContent value="open" className="space-y-4">
            {/* Search and Filter Controls */}
            <Card className="p-4">
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by location, zip code, keyword etc…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SlidersHorizontal className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Most Recent</SelectItem>
                      <SelectItem value="highest_payout">Highest Payout</SelectItem>
                      <SelectItem value="highest_rated">Highly Rated Rider</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(searchQuery || sortBy !== "newest") && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {filteredOpenRequests.length} trip{filteredOpenRequests.length !== 1 ? 's' : ''} found
                    </span>
                    {(searchQuery || sortBy !== "newest") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSearchQuery("");
                          setSortBy("newest");
                        }}
                      >
                        Clear Filters
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Card>

            {filteredOpenRequests.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  {searchQuery ? "No trips match your search" : "No open trip requests available"}
                </CardContent>
              </Card>
            ) : (
              filteredOpenRequests.map((request) => renderTripCard(request))
            )}
          </TabsContent>

          <TabsContent value="connected" className="space-y-4">
            {connectedRequests.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No connected trips
                </CardContent>
              </Card>
            ) : (
              connectedRequests.map((request) => renderTripCard(request))
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {completedRequests.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No completed trips yet
                </CardContent>
              </Card>
            ) : (
              completedRequests.map((request) => renderTripCard(request))
            )}
          </TabsContent>

          <TabsContent value="chat" className="space-y-4">
            <CommunityChat />
          </TabsContent>
        </Tabs>
        </div>
        
        {activeTab !== "chat" && (
          <>
            <FloatingSupport />
            <FloatingChat />
          </>
        )}
      </div>
    </div>
  );
};

export default DriverDashboard;
