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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [reasonCode, setReasonCode] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const cancelReasons = [
    { value: "rider_changed_mind", label: "Changed my mind" },
    { value: "driver_unavailable", label: "Driver unavailable" },
    { value: "price_dispute", label: "Price issue" },
    { value: "no_show", label: "No-show" },
    { value: "late", label: "Running late" },
    { value: "duplicate_request", label: "Duplicate request" },
    { value: "safety", label: "Safety concern" },
    { value: "weather", label: "Weather conditions" },
    { value: "other", label: "Other reason" },
  ];

  const handleSubmit = async () => {
    if (action === "cancel") {
      if (!reason.trim()) {
        toast.error("Please provide a cancellation reason");
        return;
      }
      if (!reasonCode) {
        toast.error("Please select a reason category");
        return;
      }
    }

    setSubmitting(true);

    try {
      const updates: any = {};

      if (action === "complete") {
        // Mark trip as completed immediately when one user completes
        updates.status = "completed";
        updates[userRole === "rider" ? "rider_completed" : "driver_completed"] = true;

        // Get current user ID from auth
        const { data: { user } } = await supabase.auth.getUser();
        
        // Set active_role based on completion and reset active ride
        if (user?.id) {
          await supabase
            .from("profiles")
            .update({ 
              active_assigned_ride_id: null,
              active_role: userRole  // Set to 'rider' or 'driver' based on who completed
            })
            .eq("id", user.id);
        }

        const { error } = await supabase
          .from("ride_requests")
          .update(updates)
          .eq("id", request.id);

        if (error) throw error;

        toast.success("Trip marked as completed!");
      } else {
        // Cancel trip
        updates.status = "cancelled";
        updates.cancelled_at = new Date().toISOString();
        updates[userRole === "rider" ? "cancel_reason_rider" : "cancel_reason_driver"] = reason;
        updates.cancelled_by = userRole;
        updates.cancel_reason_code = reasonCode;

        // Get current user ID from auth
        const { data: { user } } = await supabase.auth.getUser();
        
        // Only reset active ride for the CURRENT user (we don't have permission to update other user's profile)
        if (user?.id) {
          await supabase
            .from("profiles")
            .update({ active_assigned_ride_id: null })
            .eq("id", user.id);
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
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reasonCode">Reason Category *</Label>
              <Select value={reasonCode} onValueChange={setReasonCode}>
                <SelectTrigger id="reasonCode">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {cancelReasons.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Additional Details *</Label>
              <Textarea
                id="reason"
                placeholder="Explain why you're cancelling..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                required
              />
            </div>
            {reasonCode && ['safety', 'weather', 'duplicate_request'].includes(reasonCode) && (
              <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                ℹ️ This cancellation type may not affect your cancellation rate.
              </p>
            )}
          </div>
        )}

        {action === "complete" && (
          <div className="bg-muted/50 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">
              Once you mark this trip as complete, both you and the other user will be able to request or accept new trips immediately. The other user will be prompted to rate you.
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