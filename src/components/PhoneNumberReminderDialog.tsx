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
import { useNavigate } from "react-router-dom";

interface PhoneNumberReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showProfileButton?: boolean;
}

export function PhoneNumberReminderDialog({ 
  open, 
  onOpenChange,
  showProfileButton = true 
}: PhoneNumberReminderDialogProps) {
  const navigate = useNavigate();

  const handleUpdateProfile = () => {
    onOpenChange(false);
    navigate('/profile');
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl">📞 Complete Your Profile</AlertDialogTitle>
          <AlertDialogDescription className="space-y-4 text-base">
            <p className="font-semibold text-foreground">Add your phone number to connect with others!</p>
            
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
              A phone number is needed for in-app calling during trips.
            </p>
            
            {/* A2P 10DLC Compliance - SMS Consent Disclosure */}
            <div className="p-2 bg-muted/30 rounded border border-border/50 space-y-1">
              <p className="text-xs text-muted-foreground/80">
                By providing your mobile number, you agree to receive SMS messages from CashRidez related to account activity, trip connections, and notifications. Message frequency may vary. Message and data rates may apply. Reply STOP to opt out or HELP for help.
              </p>
              <a 
                href="https://cashridez.com/privacy-policy" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-primary hover:text-primary/80 underline underline-offset-2"
              >
                Privacy Policy
              </a>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          {showProfileButton && (
            <AlertDialogAction 
              onClick={handleUpdateProfile}
              className="w-full bg-primary hover:bg-primary/90"
            >
              Update Profile
            </AlertDialogAction>
          )}
          <AlertDialogAction 
            onClick={() => onOpenChange(false)}
            className={showProfileButton ? "w-full bg-muted text-foreground hover:bg-muted/80" : "w-full"}
          >
            {showProfileButton ? "Remind Me Later" : "Got it!"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
