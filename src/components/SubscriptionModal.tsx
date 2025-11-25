import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, Car, MessageSquare } from "lucide-react";
import { PremiumCrown } from "@/components/PremiumCrown";
import { useSubscription } from "@/hooks/useSubscription";
import { toast } from "sonner";

interface SubscriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: "trips" | "chat";
  completedCount?: number;
}

export const SubscriptionModal = ({ open, onOpenChange, feature, completedCount = 0 }: SubscriptionModalProps) => {
  const { startCheckout } = useSubscription();

  const handleSubscribe = async () => {
    try {
      await startCheckout(window.location.href);
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to start checkout. Please try again.");
    }
  };

  const featureText = feature === "trips" 
    ? `You've reached your limit of 3 free trips (${completedCount} completed). Upgrade to unlimited trips!`
    : "You've reached your limit of 10 free chat messages. Upgrade for unlimited community chat!";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 mx-auto mb-4">
            <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <DialogTitle className="text-center">
            Free {feature === "trips" ? "Trip" : "Chat"} Limit Reached
          </DialogTitle>
          <DialogDescription className="text-center">
            {featureText}
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
              <Car className="w-4 h-4 text-[hsl(var(--premium-gold))]" />
              <span>Unlimited trip posts & acceptances</span>
            </div>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[hsl(var(--premium-gold))]" />
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
          <Button onClick={() => onOpenChange(false)} variant="outline" className="w-full">
            Maybe Later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
