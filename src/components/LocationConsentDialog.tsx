import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Shield, Navigation } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface LocationConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onSuccess?: () => void;
}

// Approximate location by rounding to ~1km grid (0.01 degrees ≈ 1.1km)
const approximateLocation = (lat: number, lng: number) => ({
  approxLat: Math.round(lat * 100) / 100,
  approxLng: Math.round(lng * 100) / 100,
});

export function LocationConsentDialog({
  open,
  onOpenChange,
  userId,
  onSuccess,
}: LocationConsentDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleAllowLocation = async () => {
    setLoading(true);
    
    if (!navigator.geolocation) {
      toast({
        title: "Location not supported",
        description: "Your browser doesn't support geolocation.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const { approxLat, approxLng } = approximateLocation(latitude, longitude);

        try {
          // Update profile with location
          const { error } = await supabase
            .from("profiles")
            .update({
              current_lat: latitude,
              current_lng: longitude,
              location_updated_at: new Date().toISOString(),
              location_sharing_enabled: true,
            })
            .eq("id", userId);

          if (error) throw error;

          // Update driver_status if exists
          await supabase
            .from("driver_status")
            .upsert({
              user_id: userId,
              approx_geo: { lat: approxLat, lng: approxLng },
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });

          // Remember consent in localStorage
          localStorage.setItem("location_consent", "granted");

          toast({
            title: "Location shared",
            description: "Your approximate location is now visible on the map.",
          });

          onSuccess?.();
          onOpenChange(false);
        } catch (error: any) {
          console.error("Error saving location:", error);
          toast({
            title: "Error",
            description: "Failed to save your location. Please try again.",
            variant: "destructive",
          });
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        let message = "We couldn't get your location.";
        if (error.code === error.PERMISSION_DENIED) {
          message = "Location permission was denied. You can enable it in your browser settings.";
        }
        toast({
          title: "Location unavailable",
          description: message,
          variant: "destructive",
        });
        setLoading(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  const handleDecline = () => {
    localStorage.setItem("location_consent", "declined");
    onOpenChange(false);
    toast({
      title: "Location sharing skipped",
      description: "You can still use CashRidez, but your pin won't appear on the map.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            Share Your Location?
          </DialogTitle>
          <DialogDescription className="space-y-4 pt-4">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <p>
                CashRidez uses your <strong>approximate location</strong> to help 
                connect riders and drivers in your community and show trips near you.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
              <p>
                We <strong>never display your exact address</strong> — only nearby 
                areas (city/neighborhood level).
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="ghost" onClick={handleDecline} disabled={loading}>
            Not Now
          </Button>
          <Button onClick={handleAllowLocation} disabled={loading}>
            {loading ? "Getting location..." : "Allow Location"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
