import { useEffect } from "react";
import { ShieldX, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export default function BlockedPage() {
  // Sign out the user when they land on this page
  useEffect(() => {
    const signOutUser = async () => {
      await supabase.auth.signOut();
    };
    signOutUser();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldX className="w-10 h-10 text-destructive" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Account Blocked</h1>
          <p className="text-muted-foreground">
            Your account has been blocked. If you believe this is a mistake, please contact support.
          </p>
        </div>

        <Button 
          variant="outline" 
          className="gap-2"
          onClick={() => window.location.href = 'mailto:support@cashridez.com'}
        >
          <Mail className="w-4 h-4" />
          Contact Support
        </Button>
      </div>
    </div>
  );
}
