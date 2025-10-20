import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RatingDisplay } from "@/components/RatingDisplay";
import { useToast } from "@/hooks/use-toast";

export default function TripRequestsList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "closest">("newest");

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
    try {
      const { data, error } = await supabase
        .from('ride_requests')
        .select(`
          *,
          rider:profiles!ride_requests_rider_id_fkey(
            display_name,
            full_name,
            photo_url,
            rider_rating_avg,
            rider_rating_count
          )
        `)
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
      setFilteredRequests(data || []);
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

  // Filter and sort requests
  useEffect(() => {
    let filtered = [...requests];

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
  }, [requests, searchQuery, sortBy]);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Available Trip Requests</h1>
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
            <div className="text-sm text-muted-foreground">
              Showing {filteredRequests.length} of {requests.length} trip requests
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : filteredRequests.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                {searchQuery ? "No trip requests match your search." : "No trip requests available at the moment."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((request) => (
              <Card key={request.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => navigate(`/trip/${request.id}`)}>
                <CardHeader>
                  <CardTitle className="flex items-start justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3 flex-1">
                      {request.rider?.photo_url && (
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={request.rider.photo_url} alt={request.rider.full_name || request.rider.display_name || "Rider"} />
                          <AvatarFallback>{(request.rider.full_name || request.rider.display_name || "R")[0]}</AvatarFallback>
                        </Avatar>
                      )}
                      <div>
                        <span className="block font-semibold">
                          {request.rider?.full_name || request.rider?.display_name || "Anonymous"}
                        </span>
                        {request.rider?.rider_rating_count > 0 && (
                          <RatingDisplay 
                            rating={request.rider.rider_rating_avg || 0} 
                            count={request.rider.rider_rating_count || 0}
                            size="sm"
                          />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {request.status === 'assigned' && (
                        <Badge variant="default" className="bg-green-500">Accepted</Badge>
                      )}
                      <span className="text-lg font-bold text-primary">${request.price_offer}</span>
                    </div>
                  </CardTitle>
                  <CardDescription>
                    Posted {new Date(request.created_at).toLocaleDateString()} | Pickup: {new Date(request.pickup_time).toLocaleString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">Pickup</p>
                      <p className="text-sm text-muted-foreground break-words">{request.pickup_address}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">Dropoff</p>
                      <p className="text-sm text-muted-foreground break-words">{request.dropoff_address}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
