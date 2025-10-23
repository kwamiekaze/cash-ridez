import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MapPin, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const availabilityStates = [
  { value: 'available', label: 'Available', color: 'bg-green-500' },
  { value: 'on_trip', label: 'On Trip', color: 'bg-blue-500' },
  { value: 'busy', label: 'Busy', color: 'bg-yellow-500' },
  { value: 'unavailable', label: 'Unavailable', color: 'bg-gray-500' },
] as const;

export const DriverAvailability = () => {
  const { user } = useAuth();
  const [state, setState] = useState<string>('unavailable');
  const [currentZip, setCurrentZip] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (user) {
      loadAvailability();
    }
  }, [user]);

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
    // Remove all non-digits and take first 5
    const digits = input.replace(/\D/g, "");
    return digits.slice(0, 5);
  };

  const updateAvailability = async () => {
    if (!user) return;

    // Normalize ZIP (handle ZIP+4 format)
    const normalizedZip = currentZip ? normalizeZip(currentZip) : null;

    // Basic ZIP validation
    const zipRegex = /^\d{5}$/;
    if (normalizedZip && !zipRegex.test(normalizedZip)) {
      toast.error('Enter a valid ZIP (5 digits, e.g., 30117)');
      return;
    }

    // If setting to available, require a ZIP
    if (state === 'available' && !normalizedZip) {
      toast.error('Enter your current ZIP to appear in riders\' "Available Drivers" list');
      return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('driver_status')
        .upsert({
          user_id: user.id,
          state,
          current_zip: normalizedZip,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      setCurrentZip(normalizedZip || '');
      
      // Trigger notification function when driver becomes available
      if (state === 'available' && normalizedZip) {
        console.log('🚗 Triggering driver availability notifications:', {
          driver_id: user.id,
          current_zip: normalizedZip,
          state: state
        });
        
        supabase.functions.invoke('send-driver-available-notification', {
          body: {
            driver_id: user.id,
            current_zip: normalizedZip,
            state: state
          }
        }).then(result => {
          console.log('✅ Driver availability notification response:', result);
          if (result.data) {
            console.log(`📊 Notifications sent to ${result.data.notifications_sent} riders (${result.data.riders_checked} checked)`);
          }
        }).catch(err => {
          console.error('❌ Error sending driver availability notifications:', err);
          // Don't show error to user - notifications are non-critical
        });
      }

      toast.success('Availability updated successfully');
    } catch (error: any) {
      console.error('Error updating availability:', error);
      toast.error('Failed to update availability');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">Loading availability...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-primary/20" role="region" aria-label="Driver Availability">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <Activity className="h-5 w-5 text-primary" />
          Your Current Availability
        </CardTitle>
        <CardDescription className="text-sm">
          Update your availability status and location for riders to see
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 sm:space-y-6">
        {/* Availability States */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Current Status</Label>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {availabilityStates.map((status) => (
              <Button
                key={status.value}
                variant={state === status.value ? "default" : "outline"}
                className={cn(
                  "justify-start h-auto py-3 sm:py-3.5",
                  state === status.value && "ring-2 ring-offset-2 ring-primary shadow-md"
                )}
                onClick={() => setState(status.value)}
              >
                <div className={cn("w-3 h-3 rounded-full mr-2 flex-shrink-0", status.color)} />
                <span className="text-sm sm:text-base">{status.label}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* ZIP Code */}
        <div className="space-y-3">
          <Label htmlFor="zip" className="flex items-center gap-2 text-sm font-medium">
            <MapPin className="h-4 w-4 text-primary" />
            Current ZIP Code
          </Label>
          <Input
            id="zip"
            type="text"
            inputMode="numeric"
            placeholder="Enter 5-digit ZIP (e.g., 30117)"
            value={currentZip}
            onChange={(e) => {
              const normalized = e.target.value.replace(/\D/g, "").slice(0, 5);
              setCurrentZip(normalized);
            }}
            maxLength={5}
            className="text-base sm:text-lg font-medium h-11 sm:h-12"
          />
          <p className="text-xs sm:text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
            {state === 'available' 
              ? "✓ Required to appear in riders' Available Drivers list"
              : "ⓘ Riders in your ZIP will be notified when you become available"}
          </p>
        </div>

        {/* Update Button */}
        <Button
          onClick={updateAvailability}
          disabled={updating}
          className="w-full h-11 sm:h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
          size="lg"
        >
          {updating ? 'Updating...' : 'Save Availability'}
        </Button>
      </CardContent>
    </Card>
  );
};