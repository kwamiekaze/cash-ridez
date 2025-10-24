import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MapPin, Search, CheckCircle, XCircle, Calendar, DollarSign, SlidersHorizontal, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RatingDisplay } from "@/components/RatingDisplay";
import { UserChip } from "@/components/UserChip";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import TripActionDialog from "@/components/TripActionDialog";
import AppHeader from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";

export default function TripRequestsList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pageSize] = useState(30);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "recently_updated" | "highest_paying" | "highest_rated" | "shortest_distance" | "closest">("newest");
  const [activeTab, setActiveTab] = useState("open");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [selectedTrip, setSelectedTrip] = useState<any>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [action, setAction] = useState<"complete" | "cancel">("complete");

  useEffect(() => {
    fetchUserProfile();
    fetchTripRequests();

    // Subscribe to realtime updates with throttling
    let refreshTimer: any = null;
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
          if (refreshTimer) return;
          refreshTimer = setTimeout(() => {
            fetchTripRequests();
            refreshTimer = null;
          }, 1500);
        }
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchUserProfile = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('profiles')
      .select('current_lat, current_lng, pickup_address')
      .eq('id', user.id)
      .single();
    
    if (data) {
      setUserProfile(data);
    }
  };

  // Haversine formula to calculate distance between two points
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Fuzzy search implementation
  const fuzzyMatch = (text: string, query: string): boolean => {
    if (!text || !query) return false;
    text = text.toLowerCase();
    query = query.toLowerCase();
    
    // Direct match
    if (text.includes(query)) return true;
    
    // Allow for typos/partial matches
    let queryIndex = 0;
    for (let i = 0; i < text.length && queryIndex < query.length; i++) {
      if (text[i] === query[queryIndex]) {
        queryIndex++;
      }
    }
    return queryIndex === query.length;
  };

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
        .order('created_at', { ascending: false })
        .limit(pageSize);

      if (rideError) throw rideError;

        // Fetch profiles for each request (both rider and driver)
        if (rideData && rideData.length > 0) {
          const riderIds = [...new Set(rideData.map(r => r.rider_id))];
          const driverIds = [...new Set(rideData.map(r => r.assigned_driver_id).filter(Boolean))];
          
          const { data: riderProfiles } = await supabase
            .from('profiles')
            .select('id, full_name, photo_url, rider_rating_avg, rider_rating_count, is_member')
            .in('id', riderIds);

          const { data: driverProfiles } = await supabase
            .from('profiles')
            .select('id, full_name, photo_url, driver_rating_avg, driver_rating_count, is_member')
            .in('id', driverIds);

          // Merge the data
          const enrichedData = rideData.map(request => ({
            ...request,
            rider: riderProfiles?.find(p => p.id === request.rider_id),
            driver: driverProfiles?.find(p => p.id === request.assigned_driver_id)
          }));

          // Show all trips including completed ones
          setRequests(enrichedData);
          setHasMore(enrichedData.length === pageSize);
        } else {
          setRequests([]);
          setHasMore(false);
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

  const loadMoreRequests = async () => {
    if (!user || isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_verified, verification_status')
        .eq('id', user.id)
        .single();
      
      const isVerified = profile?.is_verified || profile?.verification_status === 'approved';
      
      const { data: offerData } = await supabase
        .from('counter_offers')
        .select('ride_request_id')
        .eq('by_user_id', user.id);
      
      const offerRideIds = offerData?.map(o => o.ride_request_id) || [];
      
      let query = supabase
        .from('ride_requests')
        .select('*');
      
      if (isVerified) {
        if (offerRideIds.length > 0) {
          query = query.or(`status.eq.open,rider_id.eq.${user.id},assigned_driver_id.eq.${user.id},id.in.(${offerRideIds.join(',')})`);
        } else {
          query = query.or(`status.eq.open,rider_id.eq.${user.id},assigned_driver_id.eq.${user.id}`);
        }
      } else {
        if (offerRideIds.length > 0) {
          query = query.or(`rider_id.eq.${user.id},assigned_driver_id.eq.${user.id},id.in.(${offerRideIds.join(',')})`);
        } else {
          query = query.or(`rider_id.eq.${user.id},assigned_driver_id.eq.${user.id}`);
        }
      }
      
      const oldestCreatedAt = requests[requests.length - 1]?.created_at;
      
      const { data: rideData, error: rideError } = await query
        .order('created_at', { ascending: false })
        .lt('created_at', oldestCreatedAt)
        .limit(pageSize);

      if (rideError) throw rideError;

      if (rideData && rideData.length > 0) {
        const riderIds = [...new Set(rideData.map(r => r.rider_id))];
        const driverIds = [...new Set(rideData.map(r => r.assigned_driver_id).filter(Boolean))];
        
        const { data: riderProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, photo_url, rider_rating_avg, rider_rating_count, is_member')
          .in('id', riderIds);

        const { data: driverProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, photo_url, driver_rating_avg, driver_rating_count, is_member')
          .in('id', driverIds);

        const enrichedData = rideData.map(request => ({
          ...request,
          rider: riderProfiles?.find(p => p.id === request.rider_id),
          driver: driverProfiles?.find(p => p.id === request.assigned_driver_id)
        }));

        setRequests(prev => [...prev, ...enrichedData]);
        setHasMore(enrichedData.length === pageSize);
      } else {
        setHasMore(false);
      }
    } catch (error: any) {
      console.error('Error loading more:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Enhanced filter and sort with multiple criteria
  useEffect(() => {
    let filtered = [...requests];

    // Filter by tab
    if (activeTab === "open") {
      filtered = filtered.filter(r => r.status === "open");
    } else if (activeTab === "assigned") {
      filtered = filtered.filter(r => r.status === "assigned" && r.assigned_driver_id === user?.id);
    } else if (activeTab === "completed") {
      filtered = filtered.filter(r => r.status === "completed" && r.assigned_driver_id === user?.id);
    }

    // Apply fuzzy search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter((req) => {
        const searchableText = [
          req.pickup_address,
          req.dropoff_address,
          req.pickup_zip,
          req.dropoff_zip,
          ...(req.search_keywords || [])
        ].join(' ');
        
        return fuzzyMatch(searchableText, searchQuery);
      });
    }

    // Apply active filters
    if (activeFilters.includes('local_only') && userProfile?.pickup_address) {
      const userCity = userProfile.pickup_address.split(',')[1]?.trim();
      if (userCity) {
        filtered = filtered.filter(req => 
          req.pickup_address.toLowerCase().includes(userCity.toLowerCase()) ||
          req.dropoff_address.toLowerCase().includes(userCity.toLowerCase())
        );
      }
    }

    if (activeFilters.includes('high_rated_only')) {
      filtered = filtered.filter(req => (req.rider?.rider_rating_avg || 0) >= 4.0);
    }

    // Calculate distances only for visible trips (performance optimization)
    if (userProfile?.current_lat && userProfile?.current_lng) {
      const visibleCount = Math.min(filtered.length, 50); // Only calc first 50
      filtered = filtered.map((req, idx) => ({
        ...req,
        distance: idx < visibleCount ? calculateDistance(
          userProfile.current_lat,
          userProfile.current_lng,
          parseFloat(req.pickup_lat),
          parseFloat(req.pickup_lng)
        ) : null
      }));
    }

    // Apply sorting
    if (sortBy === "newest") {
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === "recently_updated") {
      filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    } else if (sortBy === "highest_paying") {
      filtered.sort((a, b) => (b.price_offer || 0) - (a.price_offer || 0));
    } else if (sortBy === "highest_rated") {
      filtered.sort((a, b) => (b.rider?.rider_rating_avg || 0) - (a.rider?.rider_rating_avg || 0));
    } else if (sortBy === "shortest_distance") {
      filtered.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
    } else if (sortBy === "closest") {
      filtered.sort((a, b) => new Date(a.pickup_time).getTime() - new Date(b.pickup_time).getTime());
    }

    setFilteredRequests(filtered);
  }, [requests, searchQuery, sortBy, activeTab, user, activeFilters, userProfile]);

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
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <StatusBadge status={request.status} />
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}
            </span>
            {request.distance && (
              <Badge variant="outline" className="text-xs">
                {request.distance.toFixed(1)} mi
              </Badge>
            )}
          </div>
          <div className="p-3 bg-muted/30 rounded-lg mb-4">
            <UserChip
              userId={request.rider_id}
              fullName={request.rider?.full_name}
              photoUrl={request.rider?.photo_url}
              role="rider"
              ratingAvg={request.rider?.rider_rating_avg}
              ratingCount={request.rider?.rider_rating_count}
              size="md"
            />
          </div>
          {request.driver && request.status !== 'open' && (
            <div className="p-3 bg-accent/20 rounded-lg mb-4">
              <UserChip
                userId={request.assigned_driver_id}
                fullName={request.driver?.full_name}
                photoUrl={request.driver?.photo_url}
                role="driver"
                ratingAvg={request.driver?.driver_rating_avg}
                ratingCount={request.driver?.driver_rating_count}
                size="md"
              />
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

        {/* Advanced Search and Filter Section */}
        <Card className="mb-6 sticky top-16 z-10 shadow-lg">
          <CardContent className="pt-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by city, zip code, keywords... (fuzzy search enabled)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-base"
              />
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">⏱️ Newest First</SelectItem>
                    <SelectItem value="recently_updated">🔄 Recently Updated</SelectItem>
                    <SelectItem value="highest_paying">💰 Highest Paying First</SelectItem>
                    <SelectItem value="highest_rated">⭐ Highest Rated Riders</SelectItem>
                    <SelectItem value="shortest_distance">📍 Shortest Distance</SelectItem>
                    <SelectItem value="closest">🕐 Closest Pickup Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={activeFilters.includes('local_only') ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setActiveFilters(prev => 
                    prev.includes('local_only') 
                      ? prev.filter(f => f !== 'local_only')
                      : [...prev, 'local_only']
                  );
                }}
                className="transition-all"
              >
                <MapPin className="w-4 h-4 mr-1" />
                Local Only
              </Button>
              <Button
                variant={activeFilters.includes('high_rated_only') ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setActiveFilters(prev => 
                    prev.includes('high_rated_only') 
                      ? prev.filter(f => f !== 'high_rated_only')
                      : [...prev, 'high_rated_only']
                  );
                }}
                className="transition-all"
              >
                ⭐ 4+ Rated
              </Button>
              {(searchQuery || activeFilters.length > 0) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setActiveFilters([]);
                    setSortBy("newest");
                  }}
                  className="ml-auto"
                >
                  <X className="w-4 h-4 mr-1" />
                  Clear All
                </Button>
              )}
            </div>

            {/* Active Filters Display */}
            {activeFilters.length > 0 && (
              <div className="flex items-center gap-2 pt-2 border-t">
                <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Active filters:</span>
                {activeFilters.map(filter => (
                  <Badge key={filter} variant="secondary" className="gap-1">
                    {filter.replace('_', ' ')}
                    <X 
                      className="w-3 h-3 cursor-pointer hover:text-destructive" 
                      onClick={() => setActiveFilters(prev => prev.filter(f => f !== filter))}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 gap-1">
              <TabsTrigger value="open" className="text-xs sm:text-sm">Open</TabsTrigger>
              <TabsTrigger value="assigned" className="text-xs sm:text-sm">Connected</TabsTrigger>
              <TabsTrigger value="completed" className="text-xs sm:text-sm">Completed</TabsTrigger>
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
                <>
                  {filteredRequests.map(request => renderTripCard(request))}
                  {hasMore && !loading && (
                    <Card className="p-6 text-center">
                      <Button 
                        onClick={loadMoreRequests} 
                        disabled={isLoadingMore}
                        variant="outline"
                        size="lg"
                        className="w-full sm:w-auto"
                      >
                        {isLoadingMore ? 'Loading...' : `Load More (${pageSize} at a time)`}
                      </Button>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="assigned" className="mt-6 space-y-4">
              {filteredRequests.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">No connected trips</p>
                </Card>
              ) : (
                <>
                  {filteredRequests.map(request => renderTripCard(request))}
                  {hasMore && !loading && (
                    <Card className="p-6 text-center">
                      <Button 
                        onClick={loadMoreRequests} 
                        disabled={isLoadingMore}
                        variant="outline"
                        size="lg"
                        className="w-full sm:w-auto"
                      >
                        {isLoadingMore ? 'Loading...' : `Load More (${pageSize} at a time)`}
                      </Button>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="completed" className="mt-6 space-y-4">
              {filteredRequests.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">No completed trips yet</p>
                </Card>
              ) : (
                <>
                  {filteredRequests.map(request => renderTripCard(request))}
                  {hasMore && !loading && (
                    <Card className="p-6 text-center">
                      <Button 
                        onClick={loadMoreRequests} 
                        disabled={isLoadingMore}
                        variant="outline"
                        size="lg"
                        className="w-full sm:w-auto"
                      >
                        {isLoadingMore ? 'Loading...' : `Load More (${pageSize} at a time)`}
                      </Button>
                    </Card>
                  )}
                </>
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
