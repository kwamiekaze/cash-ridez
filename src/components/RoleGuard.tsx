import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface RoleGuardProps {
  children: React.ReactNode;
  requiredRole: 'rider' | 'driver';
}

const RoleGuard = ({ children, requiredRole }: RoleGuardProps) => {
  const { user, loading: authLoading } = useAuth();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkRole = async () => {
      if (!user) {
        setChecking(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("active_role")
          .eq("id", user.id)
          .single();

        if (error) {
          console.error("Error checking role:", error);
          setUserRole(null);
        } else {
          setUserRole(data?.active_role || null);
        }
      } catch (error) {
        console.error("Error checking role:", error);
        setUserRole(null);
      } finally {
        setChecking(false);
      }
    };

    checkRole();
  }, [user]);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // If user doesn't have a role set, redirect to dashboard for routing
  if (!userRole) {
    return <Navigate to="/dashboard" replace />;
  }

  // If user has the wrong role, show access denied
  if (userRole !== requiredRole) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-6">
            This page is for {requiredRole}s only. You are currently set as a {userRole}.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => window.location.href = '/dashboard'}>
              Go to Dashboard
            </Button>
            <Button variant="outline" onClick={() => window.location.href = '/profile'}>
              Change Role in Profile
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};

export default RoleGuard;