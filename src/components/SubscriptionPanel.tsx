import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { Crown, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const SubscriptionPanel = () => {
  const { 
    subscribed, 
    subscription_end, 
    completed_trips, 
    trips_remaining,
    loading,
    startCheckout,
    manageSubscription 
  } = useSubscription();

  const handleSubscribe = async () => {
    try {
      await startCheckout();
    } catch (error) {
      toast.error("Failed to start checkout. Please try again.");
    }
  };

  const handleManage = async () => {
    try {
      await manageSubscription();
    } catch (error) {
      toast.error("Failed to open subscription management. Please try again.");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5" />
            Membership
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crown className="w-5 h-5" />
          Membership
        </CardTitle>
        <CardDescription>
          {subscribed 
            ? "You have unlimited access to all features" 
            : "Get unlimited trips after your 3 free trips"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {subscribed ? (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border-2 border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span className="font-semibold text-blue-900 dark:text-blue-100">Unlimited Active</span>
              </div>
              {subscription_end && (
                <p className="text-sm text-muted-foreground">
                  Renews on {new Date(subscription_end).toLocaleDateString()}
                </p>
              )}
            </div>
            <Button 
              onClick={handleManage} 
              variant="outline" 
              className="w-full"
            >
              Manage Subscription
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="text-sm space-y-2">
                <p>Completed trips: {completed_trips} / 3 free</p>
                <p className="font-semibold">
                  {trips_remaining === 'unlimited' 
                    ? 'Unlimited trips remaining' 
                    : `${trips_remaining} free ${trips_remaining === 1 ? 'trip' : 'trips'} remaining`}
                </p>
              </div>
            </div>
            
            <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <Crown className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-1" />
                <div>
                  <p className="font-semibold text-sm mb-1">Unlimited Use - $9.99/month</p>
                  <p className="text-xs text-muted-foreground">
                    Subscribe to unlock unlimited rides and help us cover hosting, support, and new safety features that keep our community moving, saving, and earning.
                  </p>
                </div>
              </div>
            </div>

            <Button 
              onClick={handleSubscribe} 
              className="w-full"
              size="lg"
            >
              <Crown className="w-4 h-4 mr-2" />
              Subscribe for $9.99/month
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
