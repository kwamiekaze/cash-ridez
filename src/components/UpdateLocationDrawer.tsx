import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { MapPin, Activity, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadZipCentroids } from "@/lib/zipDistance";
import { MAP_CONFIG } from "@/lib/config";

const availabilityStates = [
  { value: 'available', label: 'Available', color: 'bg-green-500', icon: '🟢' },
  { value: 'on_trip', label: 'On Trip', color: 'bg-blue-500', icon: '🔵' },
  { value: 'busy', label: 'Busy', color: 'bg-yellow-500', icon: '🟡' },
  { value: 'unavailable', label: 'Unavailable', color: 'bg-gray-500', icon: '⚫' },
] as const;

// Generate stable jittered coordinates for approximate location display
const generateApproxGeo = async (zip: string, userId: string) => {
  const centroids = await loadZipCentroids();
  const centroid = centroids[zip];
  
  if (!centroid) return null;
  
  // Use user ID + date for stable jitter
  const today = new Date().toDateString();
  const seed = `${userId}-${today}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  
  const random1 = ((hash % 1000) / 1000) * 2 - 1;
  const random2 = (((hash >> 10) % 1000) / 1000) * 2 - 1;
  
  const jitterMiles = MAP_CONFIG.MAP_JITTER_MI;
  const latOffset = (random1 * jitterMiles) / 69;
  const lngOffset = (random2 * jitterMiles) / 54;
  
  return {
    lat: centroid.lat + latOffset,
    lng: centroid.lng + lngOffset
  };
};

export const UpdateLocationDrawer = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<string>('unavailable');
  const [currentZip, setCurrentZip] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (user && open) {
      loadAvailability();
    }
  }, [user, open]);

  const loadAvailability = async () => {
    try {
      const { data, error } = await supabase
        .from('driver_status')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setState(data.state);
        setCurrentZip(data.current_zip || '');
      }
    } catch (error) {
      console.error('Error loading availability:', error);
    } finally {
      setLoading(false);
    }
  };

  const normalizeZip = (input: string): string => {
    const digits = input.replace(/\D/g, "");
    return digits.slice(0, 5);
  };

  const updateAvailability = async () => {
    if (!user) return;

    const normalizedZip = currentZip ? normalizeZip(currentZip) : null;
    const zipRegex = /^\d{5}$/;
    
    if (normalizedZip && !zipRegex.test(normalizedZip)) {
      toast.error('Enter a valid 5-digit ZIP code');
      return;
    }

    if (state === 'available' && !normalizedZip) {
      toast.error('Set an approximate location to appear on the map');
      return;
    }

    setUpdating(true);
    try {
      // Generate approximate geo if available
      let approxGeo = null;
      if (state === 'available' && normalizedZip) {
        approxGeo = await generateApproxGeo(normalizedZip, user.id);
      }

      const { error } = await supabase
        .from('driver_status')
        .upsert({
          user_id: user.id,
          state,
          current_zip: normalizedZip,
          approx_geo: approxGeo,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      setCurrentZip(normalizedZip || '');
      toast.success('Location updated successfully');
      setOpen(false);
    } catch (error: any) {
      console.error('Error updating availability:', error);
      toast.error('Failed to update location');
    } finally {
      setUpdating(false);
    }
  };

  const currentStatus = availabilityStates.find(s => s.value === state);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <MapPin className="h-4 w-4" />
          <span className="hidden sm:inline">Update Location</span>
          {currentStatus && (
            <span className="text-xs">{currentStatus.icon}</span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Update Your Location
          </SheetTitle>
          <SheetDescription>
            Set your availability and approximate location to appear on riders' maps
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6 pt-6">
            {/* Availability Status */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Availability Status</Label>
              <div className="grid grid-cols-2 gap-2">
                {availabilityStates.map((status) => (
                  <Button
                    key={status.value}
                    variant={state === status.value ? "default" : "outline"}
                    className={cn(
                      "justify-start h-auto py-3",
                      state === status.value && "ring-2 ring-offset-2 ring-primary"
                    )}
                    onClick={() => setState(status.value)}
                  >
                    <span className="mr-2">{status.icon}</span>
                    <span className="text-sm">{status.label}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* ZIP Code */}
            <div className="space-y-3">
              <Label htmlFor="drawer-zip" className="flex items-center gap-2 text-sm font-medium">
                <MapPin className="h-4 w-4" />
                Approximate Location (ZIP)
              </Label>
              <Input
                id="drawer-zip"
                type="text"
                inputMode="numeric"
                placeholder="e.g., 30117"
                value={currentZip}
                onChange={(e) => {
                  const normalized = e.target.value.replace(/\D/g, "").slice(0, 5);
                  setCurrentZip(normalized);
                }}
                maxLength={5}
                className="text-lg font-medium h-12"
              />
              <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                {state === 'available' 
                  ? "✓ Required to appear on the map for riders"
                  : "ⓘ Your approximate area (privacy-safe, ~0.35 mi jitter)"}
              </p>
            </div>

            {/* Current Status Display */}
            {currentZip && (
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <p className="text-sm font-medium mb-1">Riders will see:</p>
                <p className="text-xs text-muted-foreground">
                  You're {currentStatus?.label.toLowerCase()} near ZIP {currentZip}
                </p>
              </div>
            )}

            {/* Update Button */}
            <Button
              onClick={updateAvailability}
              disabled={updating}
              className="w-full h-12 text-base font-semibold"
              size="lg"
            >
              {updating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Save & Notify Riders'
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Privacy: Exact location never stored. Map shows approximate area only.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
