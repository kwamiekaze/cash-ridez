import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Phone, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface VerificationWelcomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export function VerificationWelcomeDialog({ open, onOpenChange, userId }: VerificationWelcomeDialogProps) {
  const handleDismiss = async () => {
    // Permanently dismiss the dialog by saving preference to database
    await supabase
      .from('profiles')
      .update({ verification_welcome_dismissed: true })
      .eq('id', userId);
    
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl">🎉 Welcome to Cash Ridez!</AlertDialogTitle>
          <AlertDialogDescription className="space-y-4 text-base">
            <p className="font-semibold text-foreground">Your account has been verified!</p>
            
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Phone className="w-4 h-4 text-primary" />
                </div>
                <div className="space-y-1 flex-1">
                  <p className="font-semibold text-foreground text-sm">Enable In-App Calling</p>
                  <p className="text-sm">
                    Save <span className="font-mono font-semibold text-primary">+1 (678) 928-8816</span> as 
                    <span className="font-semibold"> "Cash Ridez Connect"</span> in your contacts to enable secure in-app calling.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <UserPlus className="w-4 h-4 text-primary" />
                </div>
                <div className="space-y-1 flex-1">
                  <p className="font-semibold text-foreground text-sm">Update Your Profile</p>
                  <p className="text-sm">
                    Add your working phone number to your profile so riders and drivers can reach you.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              You can now post and accept ride requests!
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction className="w-full" onClick={handleDismiss}>Got it!</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
