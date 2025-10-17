import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface AcceptRideDialogProps {
  request: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
}

const AcceptRideDialog = ({ request, open, onOpenChange, driverId }: AcceptRideDialogProps) => {
  const [eta, setEta] = useState("");
  const [accepting, setAccepting] = useState(false);

  const handleAccept = async () => {
    if (!eta || parseInt(eta) < 1 || parseInt(eta) > 240) {
      toast.error("Please enter a valid ETA (1-240 minutes)");
      return;
    }

    setAccepting(true);

    try {
      // Call the atomic edge function to handle race conditions
      const { data, error } = await supabase.functions.invoke('accept-ride', {
        body: {
          rideId: request.id,
          etaMinutes: parseInt(eta),
        },
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to accept ride');
      }

      toast.success("Ride accepted! Rider has been notified.");
      onOpenChange(false);
      window.location.reload();
    } catch (error: any) {
      toast.error(error.message || "Failed to accept ride");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accept Ride Request</DialogTitle>
          <DialogDescription>
            Please provide your estimated time of arrival to the pickup location
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="eta">ETA (minutes) *</Label>
            <Input
              id="eta"
              type="number"
              placeholder="15"
              min="1"
              max="240"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">Enter a value between 1 and 240 minutes</p>
          </div>

          <div className="bg-muted/50 p-4 rounded-lg">
            <p className="text-sm font-medium mb-2">Ride Details:</p>
            <p className="text-sm text-muted-foreground">
              <strong>Pickup:</strong> {request.pickup_address}
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Dropoff:</strong> {request.dropoff_address}
            </p>
            {request.price_offer && (
              <p className="text-sm text-muted-foreground">
                <strong>Offered Price:</strong> ${request.price_offer}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={accepting}>
            Cancel
          </Button>
          <Button className="bg-gradient-primary" onClick={handleAccept} disabled={accepting}>
            {accepting ? "Accepting..." : "Accept Ride"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AcceptRideDialog;
