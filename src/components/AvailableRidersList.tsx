import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, Star, Clock, Calendar } from "lucide-react";
import { loadZipCentroids, zipDistanceMiles, isWithin25Miles, formatDistance } from "@/lib/zipDistance";
import { useNavigate } from "react-router-dom";

export const AvailableRidersList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [riders, setRiders] = useState<any[]>([]);
  const [filteredRiders, setFilteredRiders] = useState<any[]>([]);
  const [driverZip, setDriverZip] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"distance" | "rating" | "cancellation" | "recent">("recent");
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pageSize] = useState(30);

  useEffect(() => {
    if (user) {
      loadOnlineRiders();
      
      // Subscribe to ride_requests changes for realtime updates (throttled)
      let refreshTimer: any = null;
      const channel = supabase
        .channel('ride_requests_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'ride_requests',
          },
          () => {
            if (refreshTimer) return;
            refreshTimer = setTimeout(() => {
              loadOnlineRiders();
              refreshTimer = null;
            }, 1500);
          }
        )
        .subscribe();

      return () => {
        if (refreshTimer) clearTimeout(refreshTimer);
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const loadOnlineRiders = async () => {
    if (!user) return;

    try {
      // Get driver's ZIP code from their status
      const { data: driverStatus } = await supabase
        .from('driver_status')
        .select('current_zip')
        .eq('user_id', user.id)
        .single();

      const zipCode = driverStatus?.current_zip;
      setDriverZip(zipCode);

      if (!zipCode) {
        console.log('❌ No driver ZIP set');
        setLoading(false);
        return;
      }

      console.log('✅ Driver ZIP:', zipCode);

      // Ensure ZIP centroids are loaded
      await loadZipCentroids();

      // Get ALL open ride requests (riders who are "online" looking for rides)
      // This query fetches EVERY open ride request, not just recent ones
      const { data: openRequests, error } = await supabase
        .from('ride_requests')
        .select('id, rider_id, pickup_address, dropoff_address, pickup_zip, pickup_time, price_offer, created_at')
        .eq('status', 'open')
        .order('created_at', { ascending: false }); // Most recent posts first

      if (error) throw error;

      console.log(`📍 Found ${openRequests?.length || 0} open ride requests (first page)`);

      if (openRequests && openRequests.length > 0) {
        // Get rider profiles for all requests
        const riderIds = openRequests.map(r => r.rider_id);
        
        const [profilesResult, cancelStatsResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, display_name, photo_url, rider_rating_avg, rider_rating_count, is_member, is_verified, profile_zip')
            .in('id', riderIds),
          supabase
            .from('cancellation_stats')
            .select('user_id, rider_rate_90d, badge_tier')
            .in('user_id', riderIds)
        ]);

        const riderProfiles = profilesResult.data;
        const cancelStats = cancelStatsResult.data;

        // Enrich with distance and cancel data
        const enrichedRiders = openRequests.map(request => {
          const riderProfile = riderProfiles?.find(p => p.id === request.rider_id);
          const riderZip = riderProfile?.profile_zip || request.pickup_zip;
          const distance = zipDistanceMiles(zipCode, riderZip);
          const cancelData = cancelStats?.find(c => c.user_id === request.rider_id);
          
          const isNearby = isWithin25Miles(zipCode, riderZip);
          const isSameSCF = riderZip.slice(0, 3) === zipCode.slice(0, 3);
          const isWithinRadius = distance !== null && distance <= 25;
          
          console.info(`🚗 Rider ${riderProfile?.full_name || request.rider_id}:`, {
            pickup_zip: riderZip,
            distance: distance ? `${distance.toFixed(1)} mi` : 'unknown',
            isSameSCF,
            isWithinRadius,
            isNearby
          });
          
          return {
            ...request,
            rider: riderProfile,
            distance,
            cancelRate: cancelData?.rider_rate_90d || 0,
            badgeTier: cancelData?.badge_tier || 'green',
            isNearby: isSameSCF || isWithinRadius,
            lastPosted: request.created_at
          };
        })
        .filter(r => {
          // Only show riders with names (no distance filtering)
          const included = !!r.rider?.full_name;
          if (!included) {
            console.log(`❌ Excluding rider: no name`, { id: r.rider_id });
          }
          return included;
        });

        console.log(`✅ ${enrichedRiders.length} riders with open requests`);
        setRiders(enrichedRiders);
        setFilteredRiders(enrichedRiders);
        setHasMore(enrichedRiders.length === pageSize);
      } else {
        setRiders([]);
        setFilteredRiders([]);
        setHasMore(false);
      }
    } catch (error) {
      console.error('❌ Error loading riders:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreRiders = async () => {
    if (!user || isLoadingMore || !hasMore || !driverZip) return;
    
    setIsLoadingMore(true);
    try {
      const oldestCreatedAt = riders[riders.length - 1]?.created_at;
      
      const { data: openRequests, error } = await supabase
        .from('ride_requests')
        .select('id, rider_id, pickup_address, dropoff_address, pickup_zip, pickup_time, price_offer, created_at')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .lt('created_at', oldestCreatedAt)
        .limit(pageSize);

      if (error) throw error;

      if (openRequests && openRequests.length > 0) {
        const riderIds = openRequests.map(r => r.rider_id);
        
        const [profilesResult, cancelStatsResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, display_name, photo_url, rider_rating_avg, rider_rating_count, is_member, is_verified, profile_zip')
            .in('id', riderIds),
          supabase
            .from('cancellation_stats')
            .select('user_id, rider_rate_90d, badge_tier')
            .in('user_id', riderIds)
        ]);

        const riderProfiles = profilesResult.data;
        const cancelStats = cancelStatsResult.data;

        const enrichedRiders = openRequests.map(request => {
          const riderProfile = riderProfiles?.find(p => p.id === request.rider_id);
          const riderZip = riderProfile?.profile_zip || request.pickup_zip;
          const distance = zipDistanceMiles(driverZip, riderZip);
          const cancelData = cancelStats?.find(c => c.user_id === request.rider_id);
          
          return {
            ...request,
            rider: riderProfile,
            distance,
            cancelRate: cancelData?.rider_rate_90d || 0,
            badgeTier: cancelData?.badge_tier || 'green',
            isNearby: true,
            lastPosted: request.created_at
          };
        })
        .filter(r => !!r.rider?.full_name);

        setRiders(prev => [...prev, ...enrichedRiders]);
        setHasMore(enrichedRiders.length === pageSize);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('❌ Error loading more riders:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Apply sorting when sortBy or riders change
  useEffect(() => {
    if (riders.length === 0) {
      setFilteredRiders([]);
      return;
    }

    const sorted = [...riders].sort((a, b) => {
      switch (sortBy) {
        case "rating":
          if (!a.rider?.rider_rating_avg && !b.rider?.rider_rating_avg) return 0;
          if (!a.rider?.rider_rating_avg) return 1;
          if (!b.rider?.rider_rating_avg) return -1;
          return b.rider.rider_rating_avg - a.rider.rider_rating_avg;
        
        case "cancellation":
          return (a.cancelRate || 0) - (b.cancelRate || 0);
        
        case "recent":
          if (!a.lastPosted && !b.lastPosted) return 0;
          if (!a.lastPosted) return 1;
          if (!b.lastPosted) return -1;
          return new Date(b.lastPosted).getTime() - new Date(a.lastPosted).getTime();
        
        case "distance":
        default:
          if (a.distance === null) return 1;
          if (b.distance === null) return -1;
          return a.distance - b.distance;
      }
    });

    setFilteredRiders(sorted);
  }, [riders, sortBy]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!driverZip) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Available Riders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            Update your availability status and ZIP code in the section above to see riders looking for lifts.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Riders Looking for Lifts
          </CardTitle>
          {riders.length > 0 && (
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most Recent</SelectItem>
                <SelectItem value="distance">Closest to me</SelectItem>
                <SelectItem value="rating">Highest rated</SelectItem>
                <SelectItem value="cancellation">Lowest cancellation rate</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {riders.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No riders are currently looking for lifts.
          </p>
        ) : (
          <>
            <div className="grid gap-4">
              {filteredRiders.map((request) => (
                <Card 
                  key={request.id} 
                  className="overflow-hidden hover:shadow-md transition-shadow border-2 cursor-pointer"
                  onClick={() => navigate(`/trip/${request.id}`)}
                >
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <Avatar className="h-14 w-14 sm:h-16 sm:w-16 ring-2 ring-primary/10 flex-shrink-0">
                        <AvatarImage src={request.rider?.photo_url || ""} />
                        <AvatarFallback className="text-base sm:text-lg">
                          {request.rider?.full_name?.split(" ").map((n: string) => n[0]).join("").toUpperCase() || "R"}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0 space-y-2 sm:space-y-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold text-base sm:text-lg">{request.rider?.full_name || "Rider"}</h3>
                            {request.rider?.is_verified && (
                              <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 flex items-center gap-1">
                                ✓ Verified
                              </div>
                            )}
                            {request.rider?.is_member && (
                              <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 flex items-center gap-1">
                                ⭐ Member
                              </div>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground mb-2">
                            {request.rider?.rider_rating_avg > 0 && (
                              <div className="flex items-center gap-1">
                                <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                                <span className="font-medium text-foreground">{request.rider.rider_rating_avg.toFixed(1)}</span>
                                <span>({request.rider.rider_rating_count})</span>
                              </div>
                            )}
                            
                            <div className="flex items-center gap-1">
                              <span className="font-medium whitespace-nowrap">Cancel Rate:</span>
                              <span className={`font-medium ${
                                request.cancelRate > 15 ? 'text-red-600 dark:text-red-400' : 
                                request.cancelRate >= 5 ? 'text-yellow-600 dark:text-yellow-400' : 
                                'text-green-600 dark:text-green-400'
                              }`}>
                                {request.cancelRate?.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="space-y-1.5 text-xs sm:text-sm">
                          <div className="flex items-start gap-2">
                            <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-medium">From: {request.pickup_address}</p>
                              <p className="text-muted-foreground">To: {request.dropoff_address}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-muted-foreground">
                              Pickup: {new Date(request.pickup_time).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>

                          {request.distance && (
                            <div className="flex items-center gap-2">
                              <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                              <span className="text-muted-foreground">
                                {formatDistance(request.distance)} away
                              </span>
                            </div>
                          )}

                          {request.lastPosted && (
                            <div className="flex items-center gap-2">
                              <Clock className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                Posted {new Date(request.lastPosted).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                          )}

                          {request.price_offer && (
                            <div className="flex items-center gap-2 pt-1">
                              <span className="font-semibold text-green-600 text-sm sm:text-base">
                                💰 ${request.price_offer} offered
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {hasMore && !loading && (
              <div className="mt-6 text-center">
                <Button 
                  onClick={loadMoreRiders} 
                  disabled={isLoadingMore}
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  {isLoadingMore ? 'Loading...' : `Load More Riders (${pageSize} at a time)`}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
