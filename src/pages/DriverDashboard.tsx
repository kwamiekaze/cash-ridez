import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Calendar, Clock, DollarSign, MessageSquare, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import AppHeader from "@/components/AppHeader";
import { UserChip } from "@/components/UserChip";
import { useAuth } from "@/contexts/AuthContext";
import { TripMap } from "@/components/TripMap";
import { DriverAvailability } from "@/components/DriverAvailability";
import { AvailableRidersList } from "@/components/AvailableRidersList";

const DriverDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [openRequests, setOpenRequests] = useState<any[]>([]);
  const [connectedRequests, setConnectedRequests] = useState<any[]>([]);
  const [completedRequests, setCompletedRequests] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("open");
  const [nearbyDriverMarkers, setNearbyDriverMarkers] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      fetchRequests();
      fetchNearbyDrivers();
    }

    // Set tab from URL parameter
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [user, searchParams]);

  const fetchNearbyDrivers = async () => {
    try {
      // Get driver's own ZIP
      const { data: profile } = await supabase
        .from('profiles')
        .select('profile_zip')
        .eq('id', user?.id)
        .single();

      if (!profile?.profile_zip) return;

      // Get nearby available drivers
      const { data: driverStatuses } = await supabase
        .from('driver_status')
        .select('user_id, current_zip, state, updated_at')
        .eq('state', 'available');

      if (!driverStatuses || driverStatuses.length === 0) {
        setNearbyDriverMarkers([]);
        return;
      }

      // Get driver profiles
      const driverIds = driverStatuses.map(d => d.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, display_name, driver_rating_avg, driver_rating_count, photo_url, is_verified, is_member')
        .in('id', driverIds);

      // Get cancellation stats
      const { data: cancelStats } = await supabase
        .from('cancellation_stats')
        .select('user_id, driver_rate_90d')
        .in('user_id', driverIds);

      // Create markers
      const markers = driverStatuses.map(status => {
        const driverProfile = profiles?.find(p => p.id === status.user_id);
        const cancelData = cancelStats?.find(c => c.user_id === status.user_id);
        
        return {
          id: status.user_id,
          zip: status.current_zip,
          title: driverProfile?.full_name || driverProfile?.display_name || 'Driver',
          description: `Rating: ${driverProfile?.driver_rating_avg?.toFixed(1) || 'N/A'} ⭐ | Cancel: ${cancelData?.driver_rate_90d?.toFixed(1) || 0}%${driverProfile?.is_verified ? ' | ✓ Verified' : ''}${driverProfile?.is_member ? ' | ⭐ Member' : ''}`,
          type: 'driver' as const,
        };
      });

      setNearbyDriverMarkers(markers);
    } catch (error) {
      console.error('Error fetching nearby drivers:', error);
    }
  };

  const fetchRequests = async () => {
    try {
      // Fetch open requests
      const { data: openData } = await supabase
        .from("ride_requests")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false });

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

      // Fetch connected (assigned) requests
      const { data: connectedData } = await supabase
        .from("ride_requests")
        .select("*")
        .eq("assigned_driver_id", user?.id)
        .eq("status", "assigned")
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

      // Fetch completed requests
      const { data: completedData } = await supabase
        .from("ride_requests")
        .select("*")
        .eq("assigned_driver_id", user?.id)
        .eq("status", "completed")
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

  const renderTripCard = (request: any) => {
    const isCompleted = request.status === "completed";
    
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

          {!isCompleted && (
            <div className="flex gap-2 pt-4 border-t">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/chat/${request.id}`);
                }}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Chat
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/trip/${request.id}`);
                }}
              >
                View Details
              </Button>
            </div>
          )}

          {isCompleted && (
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2 text-sm">
                {request.rider_rating ? (
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-green-600 font-medium">Rated</span>
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
                variant="outline"
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
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">My Trips</h1>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="connected">Connected</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="availability">Availability</TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="space-y-4">
            {openRequests.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No open trip requests available
                </CardContent>
              </Card>
            ) : (
              openRequests.map((request) => renderTripCard(request))
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

          <TabsContent value="availability" className="space-y-4">
            <DriverAvailability />
            
            {/* Available Riders Section */}
            <AvailableRidersList />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default DriverDashboard;
