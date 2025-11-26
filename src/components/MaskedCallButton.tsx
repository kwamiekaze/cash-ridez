import { useState, useEffect } from "react";
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
  const [lastCallStatus, setLastCallStatus] = useState<string | null>(null);

  const fetchLastCall = async () => {
    const { data } = await supabase
      .from('calls')
      .select('status')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (data) {
      setLastCallStatus(data.status);
    }
  };

  useEffect(() => {
    fetchLastCall();
    
    // Subscribe to changes in calls table for this trip
    const channel = supabase
      .channel(`calls-${tripId}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'calls',
          filter: `trip_id=eq.${tripId}`
        }, 
        () => {
          fetchLastCall();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId]);

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
          description: "We're connecting your call. Answer the incoming call from our CashRidez number.",
          duration: 7000,
        });
        
        // Refresh call status after a few seconds
        setTimeout(() => fetchLastCall(), 3000);
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

  const getCallStatusMessage = () => {
    if (!lastCallStatus) return null;
    
    switch (lastCallStatus) {
      case 'completed':
        return "Last call: connected successfully.";
      case 'busy':
        return "Last call: the other line was busy or declined.";
      case 'no_answer':
        return "Last call: no answer.";
      case 'failed':
        return "Last call: call failed or could not be completed.";
      case 'canceled':
        return "Last call: canceled.";
      case 'ringing':
      case 'in_progress':
        return "Last call: currently in progress.";
      default:
        return null;
    }
  };

  const statusMessage = getCallStatusMessage();

  return (
    <Button
      onClick={handleCall}
      disabled={disabled || isInitiating}
      variant="outline"
      size="sm"
      className="flex-1 h-9 px-2 text-xs"
      title={statusMessage || undefined}
    >
      <Phone className="h-3.5 w-3.5 mr-1.5" />
      {isInitiating ? "Connecting..." : buttonText}
    </Button>
  );
}
