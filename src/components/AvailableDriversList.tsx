import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UserChip } from "@/components/UserChip";
import { MapPin, Loader2, Bell, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RiderZipEditor } from "./RiderZipEditor";
import { toast } from "sonner";
import { findNearbyZips } from "@/lib/zipUtils";

const statusColors = {
  available: "bg-green-500",
  on_trip: "bg-blue-500",
  busy: "bg-yellow-500",
  unavailable: "bg-gray-500",
};

const statusLabels = {
  available: "Available",
  on_trip: "On Trip",
  busy: "Busy",
  unavailable: "Unavailable",
};

export const AvailableDriversList = () => {
  const { user } = useAuth();
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
          () => {
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
        setUserZip(null);
        setNotifyNewDriver(false);
        setLoading(false);
        return;
      }

      setUserZip(profile.profile_zip);
      setNotifyNewDriver(profile.notify_new_driver || false);

      // Get nearby ZIPs using SCF matching and radius
      const nearbyZipsData = findNearbyZips(profile.profile_zip);
      const nearbyZipCodes = [profile.profile_zip, ...nearbyZipsData.map(z => z.zip)];

      // Get available drivers in nearby ZIPs
      const { data: driverStatuses, error } = await supabase
        .from('driver_status')
        .select('*')
        .eq('state', 'available')
        .in('current_zip', nearbyZipCodes);

      if (error) throw error;

      if (driverStatuses && driverStatuses.length > 0) {
        // Get driver profiles
        const driverIds = driverStatuses.map(d => d.user_id);
        const { data: driverProfiles } = await supabase
          .from('profiles')
          .select('id, display_name, driver_rating_avg, driver_rating_count, photo_url')
          .in('id', driverIds);

        // Merge data
        const enrichedDrivers = driverStatuses.map(status => ({
          ...status,
          profile: driverProfiles?.find(p => p.id === status.user_id),
        })).filter(d => d.profile); // Only include drivers with profiles

        // Sort by updated_at (most recent first), then by rating
        enrichedDrivers.sort((a, b) => {
          const timeA = new Date(a.updated_at).getTime();
          const timeB = new Date(b.updated_at).getTime();
          if (timeB !== timeA) return timeB - timeA;
          return (b.profile?.driver_rating_avg || 0) - (a.profile?.driver_rating_avg || 0);
        });

        setDrivers(enrichedDrivers);
      } else {
        setDrivers([]);
      }
    } catch (error) {
      console.error('Error loading drivers:', error);
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
        <CardContent className="p-6 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!userZip) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Available Drivers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RiderZipEditor variant="inline" onZipSaved={handleZipSaved} />
        </CardContent>
      </Card>
    );
  }

  if (drivers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Available Drivers Near {userZip}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-center py-4">
            No drivers are available near {userZip} yet.
          </p>
          
          {/* Notification Toggle */}
          <div className="flex items-center justify-between p-4 border border-border rounded-lg">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="notify-driver" className="text-sm font-normal cursor-pointer">
                Notify me when a driver becomes available near me
              </Label>
            </div>
            <Switch
              id="notify-driver"
              checked={notifyNewDriver}
              onCheckedChange={handleNotificationToggle}
              disabled={updatingNotification}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Available Drivers Near {userZip}
            </CardTitle>
            <Badge variant="secondary">{drivers.length} Available</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Notification Toggle */}
          <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/30">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="notify-driver-list" className="text-sm font-normal cursor-pointer">
                Notify me when new drivers become available
              </Label>
            </div>
            <Switch
              id="notify-driver-list"
              checked={notifyNewDriver}
              onCheckedChange={handleNotificationToggle}
              disabled={updatingNotification}
            />
          </div>

          {/* Driver List */}
          {drivers.map((driver) => (
            <Card key={driver.user_id} className="p-4 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <UserChip
                    userId={driver.user_id}
                    displayName={driver.profile.display_name}
                    photoUrl={driver.profile.photo_url}
                    role="driver"
                    ratingAvg={driver.profile.driver_rating_avg}
                    ratingCount={driver.profile.driver_rating_count}
                  />

                  <div className="flex items-center gap-4 mt-3 ml-12">
                    <div className="flex items-center gap-2 text-sm">
                      <div className={cn("w-2 h-2 rounded-full", statusColors[driver.state as keyof typeof statusColors])} />
                      <span className="text-muted-foreground">{statusLabels[driver.state as keyof typeof statusLabels]}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      ZIP {driver.current_zip}
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.href = `/profile?user=${driver.user_id}`}
                >
                  <UserIcon className="w-4 h-4 mr-2" />
                  View Profile
                </Button>
              </div>
            </Card>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
