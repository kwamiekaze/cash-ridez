import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserChip } from "@/components/UserChip";
import { MapPin, User as UserIcon, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userZip, setUserZip] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadDrivers();
    }
  }, [user]);

  const loadDrivers = async () => {
    try {
      // Get user's ZIP code
      const { data: profile } = await supabase
        .from('profiles')
        .select('profile_zip')
        .eq('id', user?.id)
        .single();

      setUserZip(profile?.profile_zip || null);

      if (!profile?.profile_zip) {
        setLoading(false);
        return;
      }

      // Get available drivers in the same ZIP
      const { data: driverStatuses, error } = await supabase
        .from('driver_status')
        .select('*')
        .eq('state', 'available')
        .eq('current_zip', profile.profile_zip);

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

        // Sort by most recently updated, then by rating
        enrichedDrivers.sort((a, b) => {
          const timeDiff = new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
          if (timeDiff !== 0) return timeDiff;
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

  if (loading) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Loading available drivers...</p>
      </div>
    );
  }

  if (!userZip) {
    return (
      <Card className="p-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-warning" />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">ZIP Code Required</h3>
            <p className="text-muted-foreground mb-4">
              Please set your ZIP code in your profile to see available drivers near you
            </p>
            <Button onClick={() => window.location.href = '/profile'}>
              Go to Profile
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (drivers.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <MapPin className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">No Drivers Available</h3>
            <p className="text-muted-foreground">
              There are currently no available drivers in your area (ZIP {userZip})
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              We'll notify you when a driver becomes available
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Available Drivers in ZIP {userZip}</h3>
        <Badge variant="secondary">{drivers.length} Available</Badge>
      </div>

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
    </div>
  );
};