import { useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function FloatingUpdatePin() {
  const { user } = useAuth();
  const [updating, setUpdating] = useState(false);

  const handleUpdatePin = async () => {
    if (!user) {
      toast.error("Please sign in to update your pin");
      return;
    }

    setUpdating(true);

    // Check if geolocation is supported
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      setUpdating(false);
      return;
    }

    // Request location
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          // When user updates pin, clear any admin-issued "clear from map" flag
          // This makes "clear from map" a temporary hide until next pin update
          const { error } = await supabase
            .from("profiles")
            .update({
              current_lat: latitude,
              current_lng: longitude,
              location_updated_at: new Date().toISOString(),
              // Clear the hidden flag - user re-appears after updating their pin
              map_history_hidden_from_public: false,
            })
            .eq("id", user.id);

          if (error) throw error;

          toast.success("Your location has been updated.");
        } catch (error) {
          console.error("Error updating location:", error);
          toast.error("Failed to update your location");
        } finally {
          setUpdating(false);
        }
      },
      (error) => {
        setUpdating(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            toast.error("Enable location to update your approximate position on the map.", {
              duration: 5000,
            });
            break;
          case error.POSITION_UNAVAILABLE:
            toast.error("Location information is unavailable.");
            break;
          case error.TIMEOUT:
            toast.error("Location request timed out.");
            break;
          default:
            toast.error("An error occurred while getting your location.");
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  if (!user) return null;

  return (
    <Button
      onClick={handleUpdatePin}
      disabled={updating}
      size="icon"
      className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground"
      title="Update My Pin"
    >
      {updating ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : (
        <MapPin className="h-6 w-6" />
      )}
    </Button>
  );
}
