import { useState, useEffect } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { canUserUpdateMapPin } from "@/lib/mapPermissions";

/**
 * HeaderPinButton - Update pin button for the top navigation bar
 * Matches the style of NotificationBell and ThemeToggle
 */
export function HeaderPinButton() {
  const { user } = useAuth();
  const [updating, setUpdating] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<{ is_verified?: boolean; verification_status?: string } | null>(null);

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    };
    checkAdmin();
  }, [user]);

  // Fetch user verification status
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("is_verified, verification_status")
        .eq("id", user.id)
        .single();
      if (data) {
        setProfile(data);
      }
    };
    fetchProfile();
  }, [user]);

  const canUpdatePin = canUserUpdateMapPin(profile, isAdmin);

  const handleUpdatePin = async () => {
    if (!user) {
      toast.error("Please sign in to update your pin");
      return;
    }

    // Check verification status before allowing update
    if (!canUpdatePin) {
      toast.error("ID verification required to update your pin.");
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
          const { error } = await supabase
            .from("profiles")
            .update({
              current_lat: latitude,
              current_lng: longitude,
              location_updated_at: new Date().toISOString(),
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
            toast.error("Enable location to update your position on the map.", {
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

  if (!user || !canUpdatePin) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleUpdatePin}
      disabled={updating}
      className="h-8 w-8 sm:h-9 sm:w-9"
      title="Update My Pin"
    >
      {updating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <MapPin className="h-4 w-4" />
      )}
    </Button>
  );
}
