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

interface RejectVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason?: string) => void;
  userName?: string;
}

export function RejectVerificationDialog({
  open,
  onOpenChange,
  onConfirm,
  userName,
}: RejectVerificationDialogProps) {
  const [reason, setReason] = useState("");
  const maxLength = 250;

  const handleConfirm = () => {
    onConfirm(reason.trim() || undefined);
    setReason("");
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setReason("");
    }
    onOpenChange(newOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Reject Verification?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to reject {userName ? `${userName}'s` : 'this'} ID verification? 
            The user will need to resubmit their verification documents.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="space-y-2 py-2">
          <Label htmlFor="rejection-reason" className="text-sm font-medium">
            Reason for rejection (shown to user)
          </Label>
          <Textarea
            id="rejection-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, maxLength))}
            placeholder="e.g., Image was blurry, ID expired, name doesn't match..."
            rows={3}
            className="resize-none text-sm"
          />
          <p className="text-xs text-muted-foreground text-right">
            {reason.length}/{maxLength}
          </p>
          <p className="text-xs text-muted-foreground">
            Optional: If provided, the user will see this reason in their notification.
          </p>
        </div>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleConfirm}
            className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Yes, Reject
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
