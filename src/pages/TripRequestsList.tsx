import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MapPin, Search, CheckCircle, XCircle, Calendar, DollarSign } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RatingDisplay } from "@/components/RatingDisplay";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import TripActionDialog from "@/components/TripActionDialog";
import AppHeader from "@/components/AppHeader";

export default function TripRequestsList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "closest">("newest");
  const [activeTab, setActiveTab] = useState("open");
  const [selectedTrip, setSelectedTrip] = useState<any>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [action, setAction] = useState<"complete" | "cancel">("complete");

  useEffect(() => {
    fetchTripRequests();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('trip-requests-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ride_requests'
        },
        () => {
          fetchTripRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchTripRequests = async () => {
    if (!user) return;
    
    try {
      // Check if user is verified to see all open trips
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_verified, verification_status')
        .eq('id', user.id)
        .single();
      
      const isVerified = profile?.is_verified || profile?.verification_status === 'approved';
      
      // Get all rides where user has made an offer
      const { data: offerData } = await supabase
        .from('counter_offers')
        .select('ride_request_id')
        .eq('by_user_id', user.id);
      
      const offerRideIds = offerData?.map(o => o.ride_request_id) || [];
      
      // For verified users, get ALL open trips plus their own involved trips
      // For non-verified users, only show trips they're involved in
      let query = supabase
        .from('ride_requests')
        .select('*');
      
      if (isVerified) {
        // Verified users can see all open trips OR trips they're involved in
        if (offerRideIds.length > 0) {
          query = query.or(`status.eq.open,rider_id.eq.${user.id},assigned_driver_id.eq.${user.id},id.in.(${offerRideIds.join(',')})`);
        } else {
          query = query.or(`status.eq.open,rider_id.eq.${user.id},assigned_driver_id.eq.${user.id}`);
        }
      } else {
        // Non-verified users only see trips they're directly involved in
        if (offerRideIds.length > 0) {
          query = query.or(`rider_id.eq.${user.id},assigned_driver_id.eq.${user.id},id.in.(${offerRideIds.join(',')})`);
        } else {
          query = query.or(`rider_id.eq.${user.id},assigned_driver_id.eq.${user.id}`);
        }
      }
      
      const { data: rideData, error: rideError } = await query
        .order('created_at', { ascending: false });

      if (rideError) throw rideError;

        // Fetch profiles for each request (both rider and driver)
        if (rideData && rideData.length > 0) {
          const riderIds = [...new Set(rideData.map(r => r.rider_id))];
          const driverIds = [...new Set(rideData.map(r => r.assigned_driver_id).filter(Boolean))];
          
          const { data: riderProfiles } = await supabase
            .from('profiles')
            .select('id, display_name, full_name, photo_url, rider_rating_avg, rider_rating_count')
            .in('id', riderIds);

          const { data: driverProfiles } = await supabase
            .from('profiles')
            .select('id, display_name, full_name, photo_url, driver_rating_avg, driver_rating_count')
            .in('id', driverIds);

          // Merge the data
          const enrichedData = rideData.map(request => ({
            ...request,
            rider: riderProfiles?.find(p => p.id === request.rider_id),
            driver: driverProfiles?.find(p => p.id === request.assigned_driver_id)
          }));

          // Show all trips including completed ones
          setRequests(enrichedData);
        } else {
          setRequests([]);
        }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort requests based on active tab
  useEffect(() => {
    let filtered = [...requests];

    // Filter by tab
    if (activeTab === "open") {
      filtered = filtered.filter(r => r.status === "open");
    } else if (activeTab === "assigned") {
      filtered = filtered.filter(r => r.status === "assigned" && r.assigned_driver_id === user?.id);
    } else if (activeTab === "completed") {
      filtered = filtered.filter(r => r.status === "completed" && r.assigned_driver_id === user?.id);
    } else if (activeTab === "cancelled") {
      filtered = filtered.filter(r => r.status === "cancelled" && (r.assigned_driver_id === user?.id || r.cancelled_by === "driver"));
    } else if (activeTab === "history") {
      filtered = filtered.filter(r => 
        (r.status === "completed" || r.status === "cancelled") && 
        r.assigned_driver_id === user?.id
      );
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((req) => {
        const searchText = `${req.pickup_address} ${req.dropoff_address} ${req.pickup_zip} ${req.dropoff_zip}`.toLowerCase();
        return searchText.includes(query) || (req.search_keywords && req.search_keywords.some((kw: string) => kw.includes(query)));
      });
    }

    // Apply sorting
    if (sortBy === "newest") {
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === "oldest") {
      filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sortBy === "closest") {
      filtered.sort((a, b) => new Date(a.pickup_time).getTime() - new Date(b.pickup_time).getTime());
    }

    setFilteredRequests(filtered);
  }, [requests, searchQuery, sortBy, activeTab, user]);

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

  const handleSuccess = () => {
    fetchTripRequests();
    setSelectedTrip(null);
  };

  const getUserRole = (request: any): "rider" | "driver" => {
    return request.rider_id === user?.id ? "rider" : "driver";
  };

  const canUserActOnTrip = (request: any): boolean => {
    // Riders can act on their own trips (open or assigned)
    if (request.rider_id === user?.id && (request.status === "open" || request.status === "assigned")) {
      return true;
    }
    // Drivers can act on trips they're assigned to
    if (request.assigned_driver_id === user?.id && request.status === "assigned") {
      return true;
    }
    return false;
  };

  const renderTripCard = (request: any) => {
    const canAct = canUserActOnTrip(request);
    const userRole = getUserRole(request);
    
    return (
    <Card 
      key={request.id} 
      className="p-6 hover:shadow-xl hover:border-primary/50 transition-all duration-200 cursor-pointer bg-gradient-to-br from-card to-card/50"
      onClick={() => navigate(`/trip/${request.id}`)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1" onClick={() => navigate(`/trip/${request.id}`)}>
          <div className="flex items-center gap-2 mb-3">
            <StatusBadge status={request.status} />
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}
            </span>
          </div>
          <div className="flex items-center gap-3 mb-4 p-3 bg-muted/30 rounded-lg">
            <Avatar className="h-12 w-12 border-2 border-background">
              <AvatarImage src={request.rider?.photo_url || ""} alt={request.rider?.full_name || "Rider"} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-base">
                {(request.rider?.full_name || request.rider?.display_name || "U")[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-base">
                  {request.rider?.full_name || `User ${request.rider_id?.slice(0, 8)}`}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  Rider
                </span>
              </div>
              <span className="block text-xs text-muted-foreground mb-1">
                ID: {request.rider_id?.slice(0, 8)}
              </span>
              <RatingDisplay 
                rating={request.rider?.rider_rating_avg || 0} 
                count={request.rider?.rider_rating_count || 0}
                size="sm"
              />
            </div>
          </div>
          {request.driver && request.status !== 'open' && (
            <div className="flex items-center gap-3 mb-4 p-3 bg-accent/20 rounded-lg">
              <Avatar className="h-10 w-10 border-2 border-background">
                <AvatarImage src={request.driver?.photo_url || ""} alt={request.driver?.full_name || "Driver"} />
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {(request.driver?.full_name || request.driver?.display_name || "D")[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold">{request.driver.full_name || request.driver.display_name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success">
                    Driver
                  </span>
                </div>
                <span className="text-xs text-muted-foreground block mb-1">
                  ID: {request.assigned_driver_id?.slice(0, 8)}
                </span>
                <RatingDisplay 
                  rating={request.driver?.driver_rating_avg || 0}
                  count={request.driver?.driver_rating_count || 0}
                  size="sm"
                />
              </div>
            </div>
          )}
          <div className="space-y-3 mb-4">
            <div className="flex items-start gap-3 pl-2 border-l-2 border-success">
              <MapPin className="w-4 h-4 mt-1 text-success flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-success">Pickup</p>
                <p className="text-sm">{request.pickup_address}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 pl-2 border-l-2 border-destructive">
              <MapPin className="w-4 h-4 mt-1 text-destructive flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-destructive">Dropoff</p>
                <p className="text-sm">{request.dropoff_address}</p>
              </div>
            </div>
          </div>
          {request.price_offer && (
            <div className="flex items-center gap-2 pt-3 border-t border-border">
              <DollarSign className="w-5 h-5 text-primary" />
              <span className="text-xl font-bold text-primary">${request.price_offer}</span>
            </div>
          )}
        </div>
        {canAct && (
          <div className="flex flex-col gap-2 ml-4">
            {request.status === "assigned" && (
              <Button
                variant="default"
                size="sm"
                onClick={(e) => handleCompleteTrip(request, e)}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Complete
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => handleCancelTrip(request, e)}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Cancel
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
      <div className="max-w-4xl mx-auto p-4">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">My Trips</h1>
        </div>

        {/* Search and Filter Section */}
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by city, zip code, or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="closest">Closest Pickup Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={() => { setSearchQuery(""); setSortBy("newest"); }}>
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 gap-1">
              <TabsTrigger value="open" className="text-xs sm:text-sm">Open</TabsTrigger>
              <TabsTrigger value="assigned" className="text-xs sm:text-sm">Connected</TabsTrigger>
              <TabsTrigger value="completed" className="text-xs sm:text-sm">Completed</TabsTrigger>
              <TabsTrigger value="cancelled" className="text-xs sm:text-sm">Cancelled</TabsTrigger>
              <TabsTrigger value="history" className="text-xs sm:text-sm">History</TabsTrigger>
            </TabsList>

            <TabsContent value="open" className="mt-6 space-y-4">
              {filteredRequests.length === 0 ? (
                <Card className="p-12 text-center bg-gradient-to-br from-card to-muted/20">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                    <MapPin className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No Open Trips</h3>
                  <p className="text-muted-foreground">Available trips will appear here</p>
                </Card>
              ) : (
                filteredRequests.map(request => renderTripCard(request))
              )}
            </TabsContent>

            <TabsContent value="assigned" className="mt-6 space-y-4">
              {filteredRequests.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">No connected trips</p>
                </Card>
              ) : (
                filteredRequests.map(request => renderTripCard(request))
              )}
            </TabsContent>

            <TabsContent value="completed" className="mt-6 space-y-4">
              {filteredRequests.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">No completed trips yet</p>
                </Card>
              ) : (
                filteredRequests.map(request => renderTripCard(request))
              )}
            </TabsContent>

            <TabsContent value="cancelled" className="mt-6 space-y-4">
              {filteredRequests.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">No cancelled trips</p>
                </Card>
              ) : (
                filteredRequests.map(request => renderTripCard(request))
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-6 space-y-4">
              {filteredRequests.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">No trip history yet</p>
                </Card>
              ) : (
                filteredRequests.map(request => renderTripCard(request))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {selectedTrip && (
        <TripActionDialog
          request={selectedTrip}
          open={actionDialogOpen}
          onOpenChange={setActionDialogOpen}
          action={action}
          userRole={getUserRole(selectedTrip)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
