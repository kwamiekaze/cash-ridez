import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

interface TripCounterProps {
  completedTrips?: number;
  onSubscribe: () => void;
}

export const TripCounter = ({ onSubscribe }: TripCounterProps) => {
  const { isPremium, connected_trips } = useSubscription();

  // Don't show counter for premium users
  if (isPremium) {
    return null;
  }

  // Unknown count: never render it as zero.
  if (connected_trips === null) {
    return null;
  }

  const tripsRemaining = Math.max(0, 3 - connected_trips);
  const isAtLimit = connected_trips >= 3;

  return (
    <Card className={`p-4 sm:p-6 mb-6 ${isAtLimit ? 'bg-warning/10 border-warning' : 'bg-card'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
            isAtLimit ? 'bg-warning/20' : 'bg-primary/10'
          }`}>
            {isAtLimit ? (
              <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-warning" />
            ) : (
              <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold mb-1 text-sm sm:text-base">
              {isAtLimit ? 'Free Trip Limit Reached' : `${connected_trips} Connected Trip${connected_trips !== 1 ? 's' : ''}`}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {isAtLimit 
                ? 'Subscribe to continue creating and accepting trips'
                : `${tripsRemaining} free trip${tripsRemaining !== 1 ? 's' : ''} remaining before upgrade needed`
              }
            </p>
          </div>
        </div>
        {isAtLimit && (
          <Button onClick={onSubscribe} className="bg-gradient-primary w-full sm:w-auto">
            Subscribe Now
          </Button>
        )}
      </div>
    </Card>
  );
};