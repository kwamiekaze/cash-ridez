import { ReactNode, useState } from "react";
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
import { Lock, Car, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { PremiumCrown } from "@/components/PremiumCrown";

interface TripLimitGateProps {
  children: ReactNode;
  action: string;
  onProceed: () => void;
}

export const TripLimitGate = ({ children, action, onProceed }: TripLimitGateProps) => {
  const { canUseFeatures, isPremium, connected_trips, startCheckout } = useSubscription();
  const [showDialog, setShowDialog] = useState(false);

  const handleClick = () => {
    // Premium users bypass all limits
    if (isPremium) {
      onProceed();
      return;
    }
    
    // Non-premium users hit the limit check
    if (!canUseFeatures) {
      setShowDialog(true);
    } else {
      onProceed();
    }
  };

  const handleSubscribe = async () => {
    try {
      await startCheckout(window.location.href);
      setShowDialog(false);
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
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 mx-auto mb-4">
              <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <DialogTitle className="text-center">
              Free Trip Limit Reached
            </DialogTitle>
            <DialogDescription className="text-center">
              You've used your 3 free connected trips. Upgrade to unlock unlimited trips and community chat!
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 bg-gradient-to-r from-card to-card rounded-lg border border-[hsl(var(--premium-gold))]/20 space-y-3">
            <div className="text-center mb-2">
              <PremiumCrown size={32} className="inline-block" />
              <p className="font-bold text-lg mt-2 text-[hsl(var(--premium-gold))]">CashRidez Unlimited</p>
              <p className="text-xl font-bold">$9/month</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Car className="w-4 h-4 text-[hsl(var(--premium-gold))] flex-shrink-0" />
                <span>Unlimited trip posts & acceptances</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[hsl(var(--premium-gold))] flex-shrink-0" />
                <span>Unlimited community chat</span>
              </div>
              <div className="flex items-center gap-2">
                <PremiumCrown size={14} />
                <span>VIP crown badge</span>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button 
              onClick={handleSubscribe} 
              size="lg" 
              className="w-full bg-gradient-to-r from-primary to-[hsl(var(--premium-gold))] hover:opacity-90"
            >
              <PremiumCrown className="mr-2" />
              Upgrade to Unlimited – $9/month
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
