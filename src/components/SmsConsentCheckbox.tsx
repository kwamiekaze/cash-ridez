import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ExternalLink } from "lucide-react";

interface SmsConsentCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  className?: string;
}

/**
 * A2P 10DLC Compliant SMS Opt-In Checkbox
 * 
 * Requirements:
 * - Checkbox must be unchecked by default
 * - Form can be submitted without checking (optional consent)
 * - Full consent text, STOP/HELP language, and Privacy Policy visible on same screen
 */
export function SmsConsentCheckbox({ 
  checked, 
  onCheckedChange, 
  id = "sms-consent",
  className = ""
}: SmsConsentCheckboxProps) {
  return (
    <div className={`space-y-2 p-3 bg-muted/30 rounded-lg border border-border/50 ${className}`}>
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          className="mt-1 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
        />
        <Label 
          htmlFor={id} 
          className="text-xs text-muted-foreground leading-relaxed cursor-pointer select-none"
        >
          By providing my mobile number and checking this box, I agree to receive SMS messages from CashRidez related to account activity, trip connections, and notifications. Message frequency may vary. Message and data rates may apply. Reply STOP to opt out or HELP for help.
        </Label>
      </div>
      <div className="pl-7">
        <a 
          href="https://cashridez.com/privacy-policy" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-xs text-primary hover:text-primary/80 inline-flex items-center gap-1 underline underline-offset-2"
        >
          Privacy Policy
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
