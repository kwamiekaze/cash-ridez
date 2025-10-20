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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface AcceptRideDialogProps {
  request: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
}

const AcceptRideDialog = ({ request, open, onOpenChange, driverId }: AcceptRideDialogProps) => {
  const [eta, setEta] = useState("");
  const [counterAmount, setCounterAmount] = useState(request?.price_offer?.toString() || "");
  const [counterMessage, setCounterMessage] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [activeTab, setActiveTab] = useState<"accept" | "counter">("accept");

  const handleAccept = async () => {
    if (!eta || parseInt(eta) < 1 || parseInt(eta) > 240) {
      toast.error("Please enter a valid ETA (1-240 minutes)");
      return;
    }

    setAccepting(true);

    try {
      // Check if account is paused
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("paused")
        .eq("id", user?.id)
        .single();

      if (profileError) throw profileError;

      if (profile?.paused) {
        toast.error("Your account is currently paused. Please contact support to reactivate it.");
        setAccepting(false);
        return;
      }

      // Call the atomic edge function to handle race conditions
      const { data, error } = await supabase.functions.invoke('accept-ride', {
        body: {
          rideId: request.id,
          etaMinutes: parseInt(eta),
        },
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.message || 'Failed to accept ride');
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

  const handleCounterOffer = async () => {
    if (!counterAmount || parseFloat(counterAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setAccepting(true);

    try {
      const amount = parseFloat(counterAmount);
      const { error } = await supabase.from('counter_offers').insert({
        ride_request_id: request.id,
        by_user_id: driverId,
        amount,
        message: counterMessage,
        role: 'driver',
      });

      if (error) throw error;

      // Notify rider of the new counter offer
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', driverId)
        .single();

      await supabase.functions.invoke('send-offer-notification', {
        body: {
          actionType: 'new_offer',
          recipientProfileId: request.rider_id,
          senderName: senderProfile?.full_name || 'A driver',
          offerAmount: amount,
          tripId: request.id,
        },
      });

      toast.success("Counter offer sent! Rider will be notified.");
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to send counter offer");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Respond to Ride Request</DialogTitle>
          <DialogDescription>
            Accept the ride or make a counter offer
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/50 p-4 rounded-lg mb-4">
          <p className="text-sm font-medium mb-2">Ride Details:</p>
          <p className="text-sm text-muted-foreground">
            <strong>Pickup:</strong> {request.pickup_address}
          </p>
          <p className="text-sm text-muted-foreground">
            <strong>Dropoff:</strong> {request.dropoff_address}
          </p>
          {request.price_offer && (
            <p className="text-sm text-primary font-semibold mt-2">
              Offered Price: ${request.price_offer}
            </p>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "accept" | "counter")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="accept">Accept Trip</TabsTrigger>
            <TabsTrigger value="counter">Counter Offer</TabsTrigger>
          </TabsList>

          <TabsContent value="accept" className="space-y-4 mt-4">
            <div>
              <Label htmlFor="eta">Your ETA to Pickup (minutes) *</Label>
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
              <p className="text-xs text-muted-foreground mt-1">How long until you can arrive at pickup location?</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={accepting}>
                Cancel
              </Button>
              <Button className="bg-gradient-primary" onClick={handleAccept} disabled={accepting}>
                {accepting ? "Accepting..." : "Accept Ride"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="counter" className="space-y-4 mt-4">
            <div>
              <Label htmlFor="counterAmount">Your Price (in dollars) *</Label>
              <Input
                id="counterAmount"
                type="number"
                placeholder="50"
                step="1"
                min="1"
                value={counterAmount}
                onChange={(e) => setCounterAmount(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">Enter whole dollar amount (e.g., 50 for $50)</p>
            </div>
            <div>
              <Label htmlFor="counterMessage">Message (Optional)</Label>
              <Textarea
                id="counterMessage"
                placeholder="Explain your counter offer..."
                value={counterMessage}
                onChange={(e) => setCounterMessage(e.target.value)}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={accepting}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={handleCounterOffer} disabled={accepting}>
                {accepting ? "Sending..." : "Send Counter Offer"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default AcceptRideDialog;
