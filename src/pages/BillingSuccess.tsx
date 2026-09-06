import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Car, MessageSquare, Loader2, AlertCircle } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { PremiumCrown } from "@/components/PremiumCrown";

const MAX_ATTEMPTS = 6;

const BillingSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { checkStatus, subscribed } = useSubscription();
  const attemptsRef = useRef(0);
  const [timedOut, setTimedOut] = useState(false);

  // Poll until the membership is CONFIRMED by the server; never assume success
  // just because Stripe redirected here. Polling is bounded: when it runs out
  // without confirmation the page says so instead of spinning forever.
  useEffect(() => {
    if (!sessionId || subscribed) return;

    let cancelled = false;
    const poll = () => {
      if (cancelled) return;
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        setTimedOut(true);
        return;
      }
      attemptsRef.current += 1;
      checkStatus();
    };

    const timeout = setTimeout(poll, 1500);
    const interval = setInterval(poll, 4000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [sessionId, subscribed, checkStatus]);

  const confirming = !subscribed && !timedOut;
  const unconfirmed = !subscribed && timedOut;

  const retry = () => {
    attemptsRef.current = 0;
    setTimedOut(false);
    checkStatus();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full border-[hsl(var(--premium-gold))]/30 shadow-xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 rounded-full bg-[hsl(var(--premium-gold))]/20 flex items-center justify-center">
              {confirming ? (
                <Loader2 className="w-12 h-12 text-[hsl(var(--premium-gold))] animate-spin" />
              ) : unconfirmed ? (
                <AlertCircle className="w-12 h-12 text-muted-foreground" />
              ) : (
                <CheckCircle className="w-12 h-12 text-[hsl(var(--premium-gold))]" />
              )}
            </div>
          </div>
          <CardTitle className="text-3xl flex items-center justify-center gap-2">
            <PremiumCrown size={28} />
            <span>
              {confirming
                ? "Confirming Your Membership"
                : unconfirmed
                ? "Still Confirming"
                : "You're Now Unlimited!"}
            </span>
          </CardTitle>
          <CardDescription className="text-lg mt-2">
            {confirming
              ? "We're checking with our payment provider. This can take a moment."
              : unconfirmed
              ? "We couldn't confirm your membership yet. If you were charged it will activate shortly — check again in a minute."
              : "Your CashRidez Unlimited membership is active"}
          </CardDescription>
        </CardHeader>


        <CardContent className="space-y-6">
          <div className="p-4 bg-gradient-to-br from-[hsl(var(--premium-gold))]/10 to-primary/10 rounded-lg border border-[hsl(var(--premium-gold))]/20 space-y-3">
            <p className="font-semibold text-sm mb-3 text-center">Your Unlimited Benefits:</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Car className="w-4 h-4 text-[hsl(var(--premium-gold))]" />
                <span>Unlimited trip requests and acceptances</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[hsl(var(--premium-gold))]" />
                <span>Unlimited community chat messages</span>
              </div>
              <div className="flex items-center gap-2">
                <PremiumCrown size={14} />
                <span>VIP crown badge displayed everywhere</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary" />
                <span>Supporting hosting and community features</span>
              </div>
            </div>
          </div>

          {unconfirmed && (
            <Button onClick={retry} variant="outline" className="w-full" size="lg">
              Check Again
            </Button>
          )}

          <Button onClick={() => navigate("/dashboard")} className="w-full" size="lg">
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default BillingSuccess;
