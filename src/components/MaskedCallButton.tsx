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

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Call Initiated",
          description: data.message,
          duration: 7000,
        });
      } else {
        throw new Error(data?.error || 'Failed to initiate call');
      }
    } catch (error) {
      console.error('Call error:', error);
      toast({
        title: "Call Failed",
        description: error instanceof Error ? error.message : "Could not initiate call. Please try again.",
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
