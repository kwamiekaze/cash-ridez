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
import { AlertTriangle } from "lucide-react";

interface AdminCancelRideDialogProps {
  request: {
    id: string;
    status: string;
    rider_id: string;
    assigned_driver_id?: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const ADMIN_CANCEL_REASONS = [
  { value: "user_requested", label: "User requested cancellation" },
  { value: "safety_concern", label: "Safety concern" },
  { value: "fraud_suspicious", label: "Fraud / suspicious behavior" },
  { value: "duplicate_test", label: "Duplicate / test ride" },
  { value: "other", label: "Other" },
];

export function AdminCancelRideDialog({
  request,
  open,
  onOpenChange,
  onSuccess,
}: AdminCancelRideDialogProps) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const getReasonLabel = (value: string) => {
    return ADMIN_CANCEL_REASONS.find(r => r.value === value)?.label || value;
  };

  const handleSubmit = async () => {
    if (!reason) {
      toast.error("Please select a cancellation reason");
      return;
    }

    setSubmitting(true);

    try {
      // Get current admin user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Not authenticated");
      }

      // Verify user is admin
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin");

      if (!roles || roles.length === 0) {
        throw new Error("Unauthorized: Admin access required");
      }

      const reasonLabel = getReasonLabel(reason);

      // Update ride request
      const { error: updateError } = await supabase
        .from("ride_requests")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by: "admin",
          cancel_reason_rider: `Admin: ${reasonLabel}`,
          admin_cancellation_note: note.trim() || null,
        })
        .eq("id", request.id);

      if (updateError) throw updateError;

      // Clear driver's active ride if assigned
      if (request.assigned_driver_id) {
        await supabase
          .from("profiles")
          .update({ active_assigned_ride_id: null })
          .eq("id", request.assigned_driver_id);
      }

      // Get admin profile for notification
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("full_name, display_name")
        .eq("id", user.id)
        .single();

      const adminName = adminProfile?.full_name || adminProfile?.display_name || "Support";

      // Create notifications for rider and driver
      const notifications = [];
      const notificationMessage = `A ride was canceled by support: ${reasonLabel}.${note ? ` ${note}` : ""}`;

      // Rider notification
      notifications.push({
        user_id: request.rider_id,
        type: "ride_cancelled",
        title: "Ride Cancelled by Support",
        message: notificationMessage,
        link: `/trip/${request.id}`,
        related_ride_id: request.id,
        read: false,
      });

      // Driver notification (if assigned)
      if (request.assigned_driver_id) {
        notifications.push({
          user_id: request.assigned_driver_id,
          type: "ride_cancelled",
          title: "Ride Cancelled by Support",
          message: notificationMessage,
          link: `/trip/${request.id}`,
          related_ride_id: request.id,
          read: false,
        });
      }

      if (notifications.length > 0) {
        const { error: notifError } = await supabase
          .from("notifications")
          .insert(notifications);

        if (notifError) {
          console.error("Failed to create notifications:", notifError);
        }
      }

      // Post system message to chat if a direct_chat exists for this trip
      // Find the chat between rider and driver for this trip
      if (request.assigned_driver_id) {
        const { data: existingChat } = await supabase
          .from("direct_chats")
          .select("id")
          .or(`and(participant_1_id.eq.${request.rider_id},participant_2_id.eq.${request.assigned_driver_id}),and(participant_1_id.eq.${request.assigned_driver_id},participant_2_id.eq.${request.rider_id})`)
          .eq("status", "active")
          .single();

        if (existingChat) {
          // Insert system message
          const systemMessage = `⚠️ This ride was canceled by support. Reason: ${reasonLabel}`;
          await supabase
            .from("direct_messages")
            .insert({
              chat_id: existingChat.id,
              sender_id: user.id,
              message: systemMessage,
            });

          // End the chat
          await supabase
            .from("direct_chats")
            .update({ 
              status: "ended",
              ended_at: new Date().toISOString(),
              ended_by: user.id
            })
            .eq("id", existingChat.id);
        }
      }

      toast.success("Ride cancelled successfully");
      onOpenChange(false);
      setReason("");
      setNote("");
      onSuccess();
    } catch (error: any) {
      console.error("Error cancelling ride:", error);
      toast.error(error.message || "Failed to cancel ride");
    } finally {
      setSubmitting(false);
    }
  };

  // Check if ride is in a cancellable state
  const isCancellable = ["open", "assigned", "pending", "matched", "accepted", "in_progress"].includes(request.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Cancel this ride?
          </DialogTitle>
          <DialogDescription>
            This will end the ride connection and notify both parties.
          </DialogDescription>
        </DialogHeader>

        {!isCancellable ? (
          <div className="py-4 text-center">
            <p className="text-muted-foreground">
              This ride is already finalized ({request.status}) and cannot be cancelled.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Cancellation Reason *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="reason">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {ADMIN_CANCEL_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Admin Note (optional)</Label>
              <Textarea
                id="note"
                placeholder="Additional details for the cancellation..."
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 240))}
                rows={3}
                maxLength={240}
              />
              <p className="text-xs text-muted-foreground text-right">
                {note.length}/240 characters
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="sm:order-1"
          >
            Keep Ride
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting || !isCancellable || !reason}
            className="sm:order-2"
          >
            {submitting ? "Cancelling..." : "Confirm Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}