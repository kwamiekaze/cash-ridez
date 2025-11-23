import { useState } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface MaskedCallButtonProps {
  tripId: string;
  userRole: "rider" | "driver";
  tripStatus: string;
  disabled?: boolean;
}

export function MaskedCallButton({ tripId, userRole, tripStatus, disabled }: MaskedCallButtonProps) {
  const { toast } = useToast();
  const [isInitiating, setIsInitiating] = useState(false);

  const handleCall = async () => {
    setIsInitiating(true);
    try {
      const { data, error } = await supabase.functions.invoke('call-start', {
        body: { trip_id: tripId }
      });

      // If there's a network/invocation error
      if (error) {
        console.error('[MaskedCallButton] Function invocation error:', error);
        toast({
          title: "Call Failed",
          description: "Could not connect to calling service. Please check your internet connection and try again.",
          variant: "destructive",
        });
        return;
      }

      // If the function returned an error in the response
      if (data && !data.success) {
        console.error('[MaskedCallButton] Call failed:', data.error);
        toast({
          title: "Call Failed",
          description: data.error || "Could not initiate call. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // Success case
      if (data?.success) {
        toast({
          title: "Call Initiated",
          description: data.message || "You should receive a call shortly from our CashRidez number. Answer it to connect with the other party.",
          duration: 7000,
        });
      }
    } catch (error) {
      console.error('[MaskedCallButton] Unexpected call error:', error);
      toast({
        title: "Call Failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsInitiating(false);
    }
  };

  // Only show button for assigned/in_progress trips
  if (tripStatus !== 'assigned') {
    return null;
  }

  const buttonText = userRole === "rider" ? "Call Driver" : "Call Rider";

  return (
    <Button
      onClick={handleCall}
      disabled={disabled || isInitiating}
      variant="outline"
      className="flex items-center gap-2"
    >
      <Phone className="h-4 w-4" />
      {isInitiating ? "Connecting..." : buttonText}
    </Button>
  );
}
