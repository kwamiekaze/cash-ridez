import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface CancellationFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  cancelledByUserId: string;
  currentUserId: string;
}

export function CancellationFeedbackDialog({
  open,
  onOpenChange,
  tripId,
  cancelledByUserId,
  currentUserId,
}: CancellationFeedbackDialogProps) {
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!feedback.trim()) {
      toast({
        title: "Feedback Required",
        description: "Please provide feedback about the cancellation.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('cancellation_feedback')
        .insert({
          trip_id: tripId,
          from_user_id: currentUserId,
          about_user_id: cancelledByUserId,
          feedback: feedback.trim(),
        });

      if (error) throw error;

      toast({
        title: "Feedback Submitted",
        description: "Thank you for your feedback about this cancellation.",
      });

      setFeedback("");
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Trip Cancellation Feedback</DialogTitle>
          <DialogDescription>
            This trip was cancelled by the other user. Please share your feedback about this cancellation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="feedback">Your Feedback (Optional)</Label>
            <Textarea
              id="feedback"
              placeholder="Why do you think the other user cancelled? Any issues or concerns?"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Skip
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !feedback.trim()}>
            {submitting ? "Submitting..." : "Submit Feedback"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
