import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MapPin, Search, Calendar, DollarSign } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RatingDisplay } from "@/components/RatingDisplay";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import AppHeader from "@/components/AppHeader";

export default function TripHistory() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [trips, setTrips] = useState<any[]>([]);
  const [filteredTrips, setFilteredTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");
  const [activeTab, setActiveTab] = useState<"all" | "completed" | "cancelled">("all");

  useEffect(() => {
    fetchTripHistory();
  }, [user]);

  const fetchTripHistory = async () => {
    if (!user) return;
    
    try {
      // Fetch all trips where user is either rider or driver
      const { data: rideData, error: rideError } = await supabase
        .from('ride_requests')
        .select('*')
        .or(`rider_id.eq.${user.id},assigned_driver_id.eq.${user.id}`)
        .in('status', ['completed', 'cancelled'])
        .order('created_at', { ascending: false });

      if (rideError) throw rideError;

      // Fetch profiles for all participants
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
        const enrichedData = rideData.map(trip => ({
          ...trip,
          rider: riderProfiles?.find(p => p.id === trip.rider_id),
          driver: driverProfiles?.find(p => p.id === trip.assigned_driver_id),
          userRole: trip.rider_id === user.id ? 'rider' : 'driver'
        }));

        setTrips(enrichedData);
      } else {
        setTrips([]);
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

  // Filter and sort trips
  useEffect(() => {
    let filtered = [...trips];

    // Filter by tab
    if (activeTab === "completed") {
      filtered = filtered.filter(t => t.status === "completed");
    } else if (activeTab === "cancelled") {
      filtered = filtered.filter(t => t.status === "cancelled");
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((trip) => {
        const searchText = `${trip.pickup_address} ${trip.dropoff_address} ${trip.pickup_zip} ${trip.dropoff_zip}`.toLowerCase();
        return searchText.includes(query);
      });
    }

    // Apply sorting
    if (sortBy === "newest") {
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === "oldest") {
      filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }

    setFilteredTrips(filtered);
  }, [trips, searchQuery, sortBy, activeTab]);

  const renderTripCard = (trip: any) => {
    const otherUser = trip.userRole === 'rider' ? trip.driver : trip.rider;
    const otherUserRating = trip.userRole === 'rider' 
      ? { avg: trip.driver?.driver_rating_avg, count: trip.driver?.driver_rating_count }
      : { avg: trip.rider?.rider_rating_avg, count: trip.rider?.rider_rating_count };

    return (
      <Card 
        key={trip.id} 
        className="p-6 hover:shadow-lg transition-all duration-200 cursor-pointer hover:border-primary/50"
        onClick={() => navigate(`/trip/${trip.id}`)}
      >
        <div className="space-y-4">
          {/* Header with Status and Date */}
          <div className="flex items-center justify-between">
            <StatusBadge status={trip.status} />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              {format(new Date(trip.created_at), "MMM d, yyyy")}
            </div>
          </div>

          {/* Trip Participants */}
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
            <Avatar className="h-12 w-12 border-2 border-background">
              <AvatarImage src={otherUser?.photo_url || ""} alt={otherUser?.full_name || "User"} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {(otherUser?.full_name || otherUser?.display_name || "U")[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {otherUser?.full_name || otherUser?.display_name || "User"}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {trip.userRole === 'rider' ? 'Driver' : 'Rider'}
                </span>
              </div>
              <RatingDisplay 
                rating={otherUserRating.avg || 0} 
                count={otherUserRating.count || 0}
                size="sm"
              />
            </div>
          </div>

          {/* Trip Route */}
          <div className="space-y-3">
            <div className="flex items-start gap-3 pl-2 border-l-2 border-success">
              <MapPin className="w-4 h-4 mt-1 text-success flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-success">Pickup</p>
                <p className="text-sm">{trip.pickup_address}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 pl-2 border-l-2 border-destructive">
              <MapPin className="w-4 h-4 mt-1 text-destructive flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-destructive">Dropoff</p>
                <p className="text-sm">{trip.dropoff_address}</p>
              </div>
            </div>
          </div>

          {/* Price and Ratings */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            {trip.price_offer && (
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary" />
                <span className="text-lg font-bold text-primary">${trip.price_offer}</span>
              </div>
            )}
            {trip.status === 'completed' && (
              <div className="flex items-center gap-2 text-sm">
                {trip.userRole === 'rider' && trip.driver_rating && (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">You rated:</span>
                    <RatingDisplay rating={trip.driver_rating} count={0} showCount={false} size="sm" />
                  </div>
                )}
                {trip.userRole === 'driver' && trip.rider_rating && (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">You rated:</span>
                    <RatingDisplay rating={trip.rider_rating} count={0} showCount={false} size="sm" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="max-w-5xl mx-auto p-4">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Trip History</h1>
            <p className="text-muted-foreground">View all your past trips</p>
          </div>
        </div>

        {/* Search and Filter Section */}
        <Card className="mb-6">
          <div className="p-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by location, city, or zip code..."
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
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={() => { setSearchQuery(""); setSortBy("newest"); }}>
                Clear Filters
              </Button>
            </div>
          </div>
        </Card>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]" />
            <p className="mt-4 text-muted-foreground">Loading trip history...</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="all">All Trips ({trips.length})</TabsTrigger>
              <TabsTrigger value="completed">
                Completed ({trips.filter(t => t.status === 'completed').length})
              </TabsTrigger>
              <TabsTrigger value="cancelled">
                Cancelled ({trips.filter(t => t.status === 'cancelled').length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              {filteredTrips.length === 0 ? (
                <Card className="p-12 text-center">
                  <p className="text-lg text-muted-foreground">No trip history found</p>
                  <p className="text-sm text-muted-foreground mt-2">Your completed and cancelled trips will appear here</p>
                </Card>
              ) : (
                filteredTrips.map(trip => renderTripCard(trip))
              )}
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              {filteredTrips.length === 0 ? (
                <Card className="p-12 text-center">
                  <p className="text-lg text-muted-foreground">No completed trips yet</p>
                </Card>
              ) : (
                filteredTrips.map(trip => renderTripCard(trip))
              )}
            </TabsContent>

            <TabsContent value="cancelled" className="space-y-4">
              {filteredTrips.length === 0 ? (
                <Card className="p-12 text-center">
                  <p className="text-lg text-muted-foreground">No cancelled trips</p>
                </Card>
              ) : (
                filteredTrips.map(trip => renderTripCard(trip))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
