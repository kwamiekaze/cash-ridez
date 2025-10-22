import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

const BillingCancelled = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <XCircle className="w-10 h-10 text-muted-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">Checkout Cancelled</CardTitle>
          <CardDescription>
            No worries! You can subscribe anytime from your dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground text-center">
              You still have access to your remaining free trips.
            </p>
          </div>

          <Button onClick={() => navigate("/dashboard")} className="w-full" size="lg">
            Return to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default BillingCancelled;
