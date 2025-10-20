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
import { ArrowLeft, MapPin, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RatingDisplay } from "@/components/RatingDisplay";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

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
      // Get all rides where user has made an offer
      const { data: offerData } = await supabase
        .from('counter_offers')
        .select('ride_request_id')
        .eq('by_user_id', user.id);
      
      const offerRideIds = offerData?.map(o => o.ride_request_id) || [];
      
      // Get all rides where user is rider, assigned driver, OR where user made an offer
      let query = supabase
        .from('ride_requests')
        .select('*');
      
      if (offerRideIds.length > 0) {
        query = query.or(`rider_id.eq.${user.id},assigned_driver_id.eq.${user.id},id.in.(${offerRideIds.join(',')})`);
      } else {
        query = query.or(`rider_id.eq.${user.id},assigned_driver_id.eq.${user.id}`);
      }
      
      const { data: rideData, error: rideError } = await query
        .order('created_at', { ascending: false });

      if (rideError) throw rideError;

      // Fetch rider profiles for each request
      if (rideData && rideData.length > 0) {
        const riderIds = [...new Set(rideData.map(r => r.rider_id))];
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, display_name, full_name, photo_url, rider_rating_avg, rider_rating_count')
          .in('id', riderIds);

        // Merge the data
        const enrichedData = rideData.map(request => ({
          ...request,
          rider: profilesData?.find(p => p.id === request.rider_id)
        }));

        // Filter out completed trips where the current user has already rated
        const filtered = enrichedData.filter(request => {
          if (request.status !== 'completed') return true;
          const isRiderView = request.rider_id === user.id;
          const isDriverView = request.assigned_driver_id === user.id;
          if (isRiderView) {
            return !request.rider_rating; // Show if rider hasn't rated
          } else if (isDriverView) {
            return !request.driver_rating; // Show if driver hasn't rated
          }
          return true; // Show if user made an offer but isn't rider/driver
        });

        setRequests(filtered);
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

  const renderTripCard = (request: any) => (
    <Card key={request.id} className="p-6 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate(`/trip/${request.id}`)}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <StatusBadge status={request.status} />
            <span className="text-xs text-muted-foreground">
              {format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}
            </span>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={request.rider?.photo_url || ""} alt={request.rider?.full_name || request.rider?.display_name || "Rider"} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {(request.rider?.full_name || request.rider?.display_name || "U")[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <span className="block font-semibold text-sm">
                {request.rider?.full_name || request.rider?.display_name || "User"}
              </span>
              <RatingDisplay 
                rating={request.rider?.rider_rating_avg || 0} 
                count={request.rider?.rider_rating_count || 0}
                size="sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 mt-1 text-success" />
              <div>
                <p className="font-medium">Pickup</p>
                <p className="text-sm text-muted-foreground">{request.pickup_address}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 mt-1 text-destructive" />
              <div>
                <p className="font-medium">Dropoff</p>
                <p className="text-sm text-muted-foreground">{request.dropoff_address}</p>
              </div>
            </div>
          </div>
          {request.price_offer && (
            <p className="text-lg font-semibold text-primary mt-2">
              Price: ${request.price_offer}
            </p>
          )}
        </div>
      </div>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
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
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">No open trips with offers</p>
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
    </div>
  );
}
