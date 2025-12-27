import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ShieldX } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface AdminBlockUserDialogProps {
  userId: string;
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AdminBlockUserDialog({
  userId,
  userName,
  open,
  onOpenChange,
  onSuccess,
}: AdminBlockUserDialogProps) {
  const { user: adminUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");

  const handleBlock = async () => {
    if (!adminUser) return;
    
    setLoading(true);
    try {
      // Update the profile to blocked status
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          blocked: true,
          blocked_at: new Date().toISOString(),
          blocked_by: adminUser.id,
          blocked_reason: reason || null,
        })
        .eq("id", userId);

      if (updateError) throw updateError;

      // Log the action
      const { error: logError } = await supabase
        .from("admin_actions")
        .insert({
          admin_id: adminUser.id,
          target_user_id: userId,
          action_type: "BLOCK_USER",
          metadata: {
            reason: reason || null,
            user_name: userName,
          },
        });

      if (logError) {
        console.error("Failed to log admin action:", logError);
      }

      toast.success(`${userName} has been permanently blocked`);
      setReason("");
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error blocking user:", error);
      toast.error(error.message || "Failed to block user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldX className="w-5 h-5" />
            Permanently block user?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left space-y-3">
            <p>
              You are about to block <strong>{userName}</strong>. This will immediately:
            </p>
            <ul className="list-disc list-inside text-sm space-y-1">
              <li>Remove their access to the platform</li>
              <li>Sign them out of all sessions</li>
              <li>Prevent them from logging in again</li>
            </ul>
            <p className="text-destructive font-medium">
              This action cannot be easily reversed.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="reason" className="text-sm text-muted-foreground">
            Reason (optional)
          </Label>
          <Textarea
            id="reason"
            placeholder="Enter reason for blocking..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="resize-none"
            rows={2}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleBlock}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Block
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
