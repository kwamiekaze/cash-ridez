import { ReactNode } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, Lock } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

interface TripLimitGateProps {
  children: ReactNode;
  action: string;
  onProceed: () => void;
}

export const TripLimitGate = ({ children, action, onProceed }: TripLimitGateProps) => {
  const { canUseFeatures, subscribed, completed_trips, startCheckout } = useSubscription();
  const [showDialog, setShowDialog] = useState(false);

  const handleClick = () => {
    if (!canUseFeatures) {
      setShowDialog(true);
    } else {
      onProceed();
    }
  };

  const handleSubscribe = async () => {
    try {
      await startCheckout();
    } catch (error) {
      toast.error("Failed to start checkout. Please try again.");
    }
  };

  return (
    <>
      <div onClick={handleClick} className="inline-block w-full">
        {children}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 mx-auto mb-4">
              <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <DialogTitle className="text-center">
              Free Trip Limit Reached
            </DialogTitle>
            <DialogDescription className="text-center">
              You've used your {completed_trips} free trips! 
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-3">
              <Crown className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-1" />
              <div>
                <p className="font-semibold text-sm mb-2">Unlimited Use - $9.99/month</p>
                <p className="text-xs text-muted-foreground">
                  Subscribe to unlock unlimited rides and help us cover hosting, support, and new safety features that keep our safe community moving, saving, and earning.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button onClick={handleSubscribe} size="lg" className="w-full">
              <Crown className="w-4 h-4 mr-2" />
              Subscribe for $9.99/month
            </Button>
            <Button onClick={() => setShowDialog(false)} variant="outline" className="w-full">
              Maybe Later
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
