import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Crown, Calendar, CreditCard, AlertTriangle } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { useSubscription } from "@/hooks/useSubscription";
import { format } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { toast } from "sonner";
import { MemberBadge } from "@/components/MemberBadge";

const Subscription = () => {
  const navigate = useNavigate();
  const { subscribed, subscription_end, completed_trips, trips_remaining, loading, startCheckout, manageSubscription } = useSubscription();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  const handleSubscribe = async () => {
    setShowCheckout(true);
    try {
      await startCheckout();
    } catch (error) {
      toast.error("Failed to start checkout. Please try again.");
      setShowCheckout(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      await manageSubscription();
    } catch (error) {
      toast.error("Failed to open subscription management. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-muted rounded-lg"></div>
            <div className="h-48 bg-muted rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Button variant="ghost" className="mb-6" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <div className="space-y-6">
          {/* Current Status Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Subscription Status
                    {subscribed && <MemberBadge isMember={true} />}
                  </CardTitle>
                  <CardDescription>
                    {subscribed ? "You have unlimited access" : "Manage your CashRidez membership"}
                  </CardDescription>
                </div>
                <Crown className={`w-8 h-8 ${subscribed ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {subscribed ? (
                <>
                  <div className="flex items-center justify-between p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                        <Crown className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">Active Member</p>
                        <p className="text-sm text-muted-foreground">Unlimited rides</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">$9.99</p>
                      <p className="text-xs text-muted-foreground">per month</p>
                    </div>
                  </div>

                  {subscription_end && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      <span>Renews on {format(new Date(subscription_end), "MMMM d, yyyy")}</span>
                    </div>
                  )}

                  <div className="pt-4 border-t">
                    <h3 className="font-semibold mb-3">Membership Benefits</h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="text-success mt-0.5">✓</span>
                        <span>Unlimited ride requests and accepts</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-success mt-0.5">✓</span>
                        <span>Member badge on your profile</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-success mt-0.5">✓</span>
                        <span>Support our community and platform development</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-success mt-0.5">✓</span>
                        <span>Help us maintain safety features and 24/7 support</span>
                      </li>
                    </ul>
                  </div>

                  <Button 
                    onClick={handleManageSubscription} 
                    variant="outline" 
                    className="w-full"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Manage Subscription
                  </Button>
                </>
              ) : (
                <>
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      You've used {completed_trips} of {typeof trips_remaining === 'number' ? 3 : 'unlimited'} free trips. 
                      Subscribe to unlock unlimited access.
                    </AlertDescription>
                  </Alert>

                  <div className="p-6 bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg border border-primary/20">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <Crown className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-bold mb-2">CashRidez Member</h3>
                        <p className="text-2xl font-bold text-primary mb-1">$9.99<span className="text-base font-normal text-muted-foreground">/month</span></p>
                        <p className="text-sm text-muted-foreground mb-4">
                          Get unlimited rides and help us maintain a safe, reliable platform for everyone
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 mb-6">
                      <h4 className="font-semibold text-sm">What you get:</h4>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <span className="text-primary mt-0.5">✓</span>
                          <span><strong>Unlimited rides</strong> - Request and accept as many trips as you want</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-primary mt-0.5">✓</span>
                          <span><strong>Member badge</strong> - Stand out with verification on your profile</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-primary mt-0.5">✓</span>
                          <span><strong>Support the platform</strong> - Help cover hosting, support, and safety features</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-primary mt-0.5">✓</span>
                          <span><strong>Cancel anytime</strong> - No long-term commitment required</span>
                        </li>
                      </ul>
                    </div>

                    <Button onClick={handleSubscribe} size="lg" className="w-full">
                      <Crown className="w-4 h-4 mr-2" />
                      Subscribe Now
                    </Button>
                  </div>

                  <div className="text-center text-xs text-muted-foreground pt-4 border-t">
                    <p>Your subscription helps keep CashRidez running smoothly with 24/7 support, safety features, and platform improvements.</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Trip Usage Card */}
          <Card>
            <CardHeader>
              <CardTitle>Trip Usage</CardTitle>
              <CardDescription>Your ride activity summary</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Completed Trips</p>
                  <p className="text-2xl font-bold">{completed_trips}</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Trips Remaining</p>
                  <p className="text-2xl font-bold">
                    {subscribed ? '∞' : typeof trips_remaining === 'number' ? trips_remaining : '∞'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Cancel Subscription Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Subscription?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p className="font-semibold text-destructive">
                ⚠️ Heads up: Your CashRidez membership benefits stop immediately after unsubscribing.
              </p>
              <p>You will lose access to:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Unlimited ride requests and accepts</li>
                <li>Your Member badge</li>
                <li>You'll be limited to 3 free trips total</li>
              </ul>
              <p className="text-sm mt-4">
                Are you sure you want to cancel your subscription?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleManageSubscription}
              className="bg-destructive hover:bg-destructive/90"
            >
              Continue to Cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Subscription;
