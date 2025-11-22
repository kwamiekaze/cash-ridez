import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

interface TripCounterProps {
  completedTrips: number;
  onSubscribe: () => void;
}

export const TripCounter = ({ completedTrips, onSubscribe }: TripCounterProps) => {
  const { isPremium } = useSubscription();

  // Don't show counter for premium users
  if (isPremium) {
    return null;
  }

  const tripsRemaining = Math.max(0, 3 - completedTrips);
  const isAtLimit = completedTrips >= 3;

  return (
    <Card className={`p-6 mb-6 ${isAtLimit ? 'bg-warning/10 border-warning' : 'bg-card'}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            isAtLimit ? 'bg-warning/20' : 'bg-primary/10'
          }`}>
            {isAtLimit ? (
              <AlertCircle className="w-6 h-6 text-warning" />
            ) : (
              <CheckCircle className="w-6 h-6 text-primary" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold mb-1">
              {isAtLimit ? 'Free Trip Limit Reached' : `${completedTrips} Completed Trip${completedTrips !== 1 ? 's' : ''}`}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isAtLimit 
                ? 'Subscribe to continue creating and accepting trips'
                : `${tripsRemaining} free trip${tripsRemaining !== 1 ? 's' : ''} remaining before upgrade needed`
              }
            </p>
          </div>
        </div>
        {isAtLimit && (
          <Button onClick={onSubscribe} className="bg-gradient-primary">
            Subscribe Now
          </Button>
        )}
      </div>
    </Card>
  );
};