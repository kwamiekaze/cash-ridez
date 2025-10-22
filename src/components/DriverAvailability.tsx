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

  const updateAvailability = async () => {
    if (!user) return;

    // Basic ZIP validation
    const zipRegex = /^\d{5}$/;
    if (currentZip && !zipRegex.test(currentZip)) {
      toast.error('Please enter a valid 5-digit ZIP code');
      return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('driver_status')
        .upsert({
          user_id: user.id,
          state,
          current_zip: currentZip || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Driver Availability
        </CardTitle>
        <CardDescription>
          Update your availability status and location for riders to see
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Availability States */}
        <div className="space-y-3">
          <Label>Current Status</Label>
          <div className="grid grid-cols-2 gap-3">
            {availabilityStates.map((status) => (
              <Button
                key={status.value}
                variant={state === status.value ? "default" : "outline"}
                className={cn(
                  "justify-start",
                  state === status.value && "ring-2 ring-offset-2 ring-primary"
                )}
                onClick={() => setState(status.value)}
              >
                <div className={cn("w-3 h-3 rounded-full mr-2", status.color)} />
                {status.label}
              </Button>
            ))}
          </div>
        </div>

        {/* ZIP Code */}
        <div className="space-y-3">
          <Label htmlFor="zip" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Current ZIP Code
          </Label>
          <Input
            id="zip"
            type="text"
            placeholder="Enter 5-digit ZIP"
            value={currentZip}
            onChange={(e) => setCurrentZip(e.target.value)}
            maxLength={5}
            pattern="\d{5}"
          />
          <p className="text-xs text-muted-foreground">
            Riders in your ZIP code will be notified when you become available
          </p>
        </div>

        {/* Update Button */}
        <Button
          onClick={updateAvailability}
          disabled={updating}
          className="w-full"
        >
          {updating ? 'Updating...' : 'Update Availability'}
        </Button>
      </CardContent>
    </Card>
  );
};