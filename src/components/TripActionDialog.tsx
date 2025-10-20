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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface TripActionDialogProps {
  request: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: "complete" | "cancel";
  userRole: "rider" | "driver";
  onSuccess: () => void;
}

const TripActionDialog = ({
  request,
  open,
  onOpenChange,
  action,
  userRole,
  onSuccess,
}: TripActionDialogProps) => {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (action === "cancel" && !reason.trim()) {
      toast.error("Please provide a cancellation reason");
      return;
    }

    setSubmitting(true);

    try {
      const updates: any = {};

      if (action === "complete") {
        // Mark as completed by this user
        updates[userRole === "rider" ? "rider_completed" : "driver_completed"] = true;

        // Check if both have completed
        const otherCompleted = userRole === "rider" ? request.driver_completed : request.rider_completed;
        
        if (otherCompleted) {
          // Both completed - mark trip as completed
          updates.status = "completed";
        }

        const { error } = await supabase
          .from("ride_requests")
          .update(updates)
          .eq("id", request.id);

        if (error) throw error;

        if (otherCompleted) {
          toast.success("Trip marked as completed!");
        } else {
          toast.success("Waiting for other user to confirm completion");
        }
      } else {
        // Cancel trip
        updates.status = "cancelled";
        updates.cancelled_at = new Date().toISOString();
        updates[userRole === "rider" ? "cancel_reason_rider" : "cancel_reason_driver"] = reason;
        updates.cancelled_by = userRole;

        // Reset active ride for driver
        if (request.assigned_driver_id) {
          await supabase
            .from("profiles")
            .update({ active_assigned_ride_id: null })
            .eq("id", request.assigned_driver_id);
        }

        const { error } = await supabase
          .from("ride_requests")
          .update(updates)
          .eq("id", request.id);

        if (error) throw error;

        toast.success("Trip cancelled");
      }

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || `Failed to ${action} trip`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {action === "complete" ? "Complete Trip" : "Cancel Trip"}
          </DialogTitle>
          <DialogDescription>
            {action === "complete"
              ? "Confirm that this trip has been completed successfully"
              : "Please provide a reason for cancelling this trip"}
          </DialogDescription>
        </DialogHeader>

        {action === "cancel" && (
          <div className="space-y-2">
            <Label htmlFor="reason">Cancellation Reason *</Label>
            <Textarea
              id="reason"
              placeholder="Explain why you're cancelling..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              required
            />
          </div>
        )}

        {action === "complete" && (
          <div className="bg-muted/50 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">
              {request.rider_completed && userRole === "driver"
                ? "The rider has already marked this trip as complete. Once you confirm, the trip will be completed."
                : request.driver_completed && userRole === "rider"
                ? "The driver has already marked this trip as complete. Once you confirm, the trip will be completed."
                : "Both users must mark the trip as complete before it's finalized."}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={action === "cancel" ? "destructive" : "default"}
            onClick={handleSubmit}
            disabled={submitting}
            className={action === "complete" ? "bg-gradient-primary" : ""}
          >
            {submitting ? "Processing..." : action === "complete" ? "Mark Complete" : "Cancel Trip"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TripActionDialog;