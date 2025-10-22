import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Crown } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

const BillingSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { checkStatus } = useSubscription();

  useEffect(() => {
    // Refresh subscription status after successful checkout
    if (sessionId) {
      setTimeout(() => {
        checkStatus();
      }, 2000);
    }
  }, [sessionId]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <CardTitle className="text-2xl">Welcome to Unlimited!</CardTitle>
          <CardDescription>
            Your subscription is now active
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-3">
              <Crown className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-1" />
              <div>
                <p className="font-semibold text-sm mb-2">You now have:</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>✓ Unlimited trip requests</li>
                  <li>✓ Unlimited trip acceptances</li>
                  <li>✓ Support community hosting costs</li>
                  <li>✓ Help fund new safety features</li>
                </ul>
              </div>
            </div>
          </div>

          <Button onClick={() => navigate("/dashboard")} className="w-full" size="lg">
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default BillingSuccess;
