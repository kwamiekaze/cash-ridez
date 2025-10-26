import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, MapPin, Star, User } from "lucide-react";
import { toast } from "sonner";
import { RiderZipEditor } from "./RiderZipEditor";
import { loadZipCentroids, zipDistanceMiles, isWithin25Miles, formatDistance } from "@/lib/zipDistance";
import { useNavigate } from "react-router-dom";

const statusLabels = {
  available: "Available",
  on_trip: "On Trip",
  busy: "Busy",
  unavailable: "Unavailable",
};

export const AvailableDriversList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [userZip, setUserZip] = useState<string | null>(null);
  const [notifyNewDriver, setNotifyNewDriver] = useState(false);
  const [updatingNotification, setUpdatingNotification] = useState(false);

  useEffect(() => {
    if (user) {
      loadAvailableDrivers();
      
      // Subscribe to driver_status changes for realtime updates
      const channel = supabase
        .channel('driver_status_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'driver_status',
          },
          (payload) => {
            console.log('🔄 Driver status changed:', payload);
            // Reload drivers when any status changes
            loadAvailableDrivers();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const loadAvailableDrivers = async () => {
    if (!user) return;

    try {
      // Get user's ZIP code and notification preference
      const { data: profile } = await supabase
        .from('profiles')
        .select('profile_zip, notify_new_driver')
        .eq('id', user.id)
        .single();

      if (!profile?.profile_zip) {
        console.log('❌ No rider ZIP set');
        setUserZip(null);
        setNotifyNewDriver(false);
        setLoading(false);
        return;
      }

      console.log('✅ Rider ZIP:', profile.profile_zip);
      setUserZip(profile.profile_zip);
      setNotifyNewDriver(profile.notify_new_driver || false);

      // Ensure ZIP centroids are loaded before computing distances
      await loadZipCentroids();

      // Get ALL available drivers (we'll filter by distance client-side)
      const { data: driverStatuses, error } = await supabase
        .from('driver_status')
        .select('*')
        .eq('state', 'available');

      if (error) throw error;

      console.log(`📍 Found ${driverStatuses?.length || 0} available drivers total`);

      if (driverStatuses && driverStatuses.length > 0) {
        // Get driver profiles with full details
        const driverIds = driverStatuses.map(d => d.user_id);
        
        // Fetch profiles and cancellation stats in parallel
        const [profilesResult, cancelStatsResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, display_name, driver_rating_avg, driver_rating_count, photo_url, is_member, is_verified')
            .in('id', driverIds),
          supabase
            .from('cancellation_stats')
            .select('user_id, driver_rate_90d, badge_tier')
            .in('user_id', driverIds)
        ]);

        const driverProfiles = profilesResult.data;
        const cancelStats = cancelStatsResult.data;

        // Merge data, calculate distances, and filter by 25-mile radius
        const enrichedDrivers = driverStatuses.map(status => {
          const driverProfile = driverProfiles?.find(p => p.id === status.user_id);
          const cancelData = cancelStats?.find(c => c.user_id === status.user_id);
          const distance = zipDistanceMiles(profile.profile_zip, status.current_zip);
          
          // Compute proximity using 25-mile rule with SCF fallback
          const isNearby = isWithin25Miles(profile.profile_zip, status.current_zip);
          const isSameSCF = status.current_zip.slice(0, 3) === profile.profile_zip.slice(0, 3);
          const isWithinRadius = distance !== null && distance <= 25;
          
          console.info(`🚗 Driver ${driverProfile?.full_name || status.user_id}:`, {
            current_zip: status.current_zip,
            distance: distance ? `${distance.toFixed(1)} mi` : 'unknown',
            isSameSCF,
            isWithinRadius,
            isNearby
          });
          
          return {
            ...status,
            ...driverProfile,
            distance,
            cancelRate: cancelData?.driver_rate_90d || 0,
            badgeTier: cancelData?.badge_tier || 'green',
            isNearby: isSameSCF || isWithinRadius
          };
        })
        .filter(d => {
          const included = d.full_name && d.isNearby;
          if (!included) {
            console.log(`❌ Excluding driver:`, {
              id: d.user_id,
              reason: !d.full_name ? 'no name' : 'not nearby'
            });
          }
          return included;
        })
        .sort((a, b) => {
          // Sort by distance (nulls last)
          if (a.distance === null) return 1;
          if (b.distance === null) return -1;
          return a.distance - b.distance;
        });

        console.log(`✅ ${enrichedDrivers.length} drivers within 25 miles`);
        setDrivers(enrichedDrivers);
      } else {
        setDrivers([]);
      }
    } catch (error) {
      console.error('❌ Error loading drivers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleZipSaved = (zip: string) => {
    setUserZip(zip);
    loadAvailableDrivers();
  };

  const handleNotificationToggle = async (enabled: boolean) => {
    if (!user) return;

    setUpdatingNotification(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ notify_new_driver: enabled })
        .eq('id', user.id);

      if (error) throw error;

      setNotifyNewDriver(enabled);
      toast.success(
        enabled 
          ? "You'll be notified when a driver becomes available near you"
          : "Driver notifications turned off"
      );
    } catch (error) {
      console.error('Error updating notification preference:', error);
      toast.error('Failed to update notification preference');
    } finally {
      setUpdatingNotification(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!userZip) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Available Drivers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Set your ZIP code to see available drivers in your area.
            </p>
            <RiderZipEditor onZipSaved={handleZipSaved} variant="inline" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Available Drivers Within 25 Miles of {userZip}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {drivers.length === 0 ? (
            <div className="space-y-6">
              <p className="text-muted-foreground text-center py-8">
                No drivers are available within 25 miles of {userZip} yet.
              </p>
              
              <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-muted/30">
                <div className="space-y-1 flex-1">
                  <Label htmlFor="notify-toggle" className="text-base font-medium cursor-pointer">
                    Notify me when a driver becomes available in my ZIP
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when drivers become available near you
                  </p>
                </div>
                <Switch
                  id="notify-toggle"
                  checked={notifyNewDriver}
                  onCheckedChange={handleNotificationToggle}
                  disabled={updatingNotification}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4">
                {drivers.map((driver) => (
                  <Card key={driver.id} className="overflow-hidden hover:shadow-md transition-shadow border-2">
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-start gap-3 sm:gap-4">
                        <Avatar className="h-14 w-14 sm:h-16 sm:w-16 ring-2 ring-primary/10 flex-shrink-0">
                          <AvatarImage src={driver.photo_url || ""} />
                          <AvatarFallback className="text-base sm:text-lg">
                            {driver.full_name?.split(" ").map((n: string) => n[0]).join("").toUpperCase() || "D"}
                          </AvatarFallback>
                        </Avatar>
                        
                         <div className="flex-1 min-w-0 space-y-2 sm:space-y-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="font-semibold text-base sm:text-lg">{driver.full_name || "Driver"}</h3>
                              {driver.is_verified && (
                                <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 flex items-center gap-1">
                                  ✓ Verified
                                </div>
                              )}
                              {driver.is_member && (
                                <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 flex items-center gap-1">
                                  ⭐ Member
                                </div>
                              )}
                              <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                                🟢 {statusLabels[driver.state]}
                              </div>
                            </div>
                            
                            <div className="flex flex-wrap gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                              {driver.driver_rating_avg > 0 && (
                                <div className="flex items-center gap-1">
                                  <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                                  <span className="font-medium text-foreground">{driver.driver_rating_avg.toFixed(1)}</span>
                                  <span>({driver.driver_rating_count})</span>
                                </div>
                              )}
                              
                              <div className="flex items-center gap-1">
                                <span className="font-medium whitespace-nowrap">Cancel Rate:</span>
                                <span className={`font-medium ${
                                  driver.cancelRate > 15 ? 'text-red-600 dark:text-red-400' : 
                                  driver.cancelRate >= 5 ? 'text-yellow-600 dark:text-yellow-400' : 
                                  'text-green-600 dark:text-green-400'
                                }`}>
                                  {driver.cancelRate?.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 text-xs sm:text-sm">
                            <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-muted-foreground">
                              Located in <span className="font-medium text-foreground">{driver.current_zip}</span>
                              {driver.distance && <span> • {formatDistance(driver.distance)}</span>}
                            </span>
                          </div>
                          
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="w-full sm:w-auto mt-2"
                            onClick={() => navigate(`/profile/${driver.id}`)}
                          >
                            <User className="h-4 w-4 mr-2" />
                            View Profile
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 border border-border rounded-lg bg-muted/30">
                <div className="space-y-1 flex-1">
                  <Label htmlFor="notify-toggle" className="text-sm sm:text-base font-medium cursor-pointer">
                    Notify me when a driver becomes available in my ZIP
                  </Label>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Get notified when new drivers become available near you
                  </p>
                </div>
                <Switch
                  id="notify-toggle"
                  checked={notifyNewDriver}
                  onCheckedChange={handleNotificationToggle}
                  disabled={updatingNotification}
                  className="flex-shrink-0"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* ZIP Editor Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <MapPin className="h-4 w-4 sm:h-5 sm:w-5" />
            Update Your Location
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RiderZipEditor onZipSaved={handleZipSaved} variant="inline" />
        </CardContent>
      </Card>
    </div>
  );
};
