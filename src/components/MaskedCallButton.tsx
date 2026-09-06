import { useState, useEffect, useRef } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

// ============================================================================
// ERROR CODE TO USER MESSAGE MAPPING
// ============================================================================
const CALL_ERROR_MESSAGES: Record<string, string> = {
  // Phone number issues
  NO_USER_PHONE: "Please add your carrier phone number to your profile to use in-app calling.",
  NO_RIDER_PHONE: "The rider hasn't provided a phone number. Please ask them to update their contact info.",
  NO_DRIVER_PHONE: "The driver hasn't added a phone number to their profile yet.",
  INVALID_PHONE_FORMAT: "The phone number format is invalid. Please update your profile with a valid US number.",
  INVALID_DESTINATION_NUMBER: "The other user's phone number seems invalid. Please ask them to update their number.",
  
  // Call state issues
  CALL_BUSY: "The person you're calling is busy. Please try again in a few minutes.",
  CALL_DECLINED: "The call was declined. The other person may be unavailable right now.",
  CALL_NO_ANSWER: "No answer. The other person may be unavailable. Try again later.",
  CALL_BUSY_OR_DECLINED: "The person you're calling is busy or declined the call.",
  
  // Trip/authorization issues
  TRIP_NOT_ASSIGNED: "This trip must be assigned before you can make a call.",
  NOT_PARTICIPANT: "You are not a participant in this trip.",
  TRIP_NOT_FOUND: "Trip not found. It may have been cancelled.",
  UNAUTHORIZED: "Please log in to use in-app calling.",
  
  // Service issues
  TWILIO_UNAVAILABLE: "Our calling service is temporarily unavailable. Please try again in a few minutes.",
  SERVER_CONFIG_ERROR: "Server configuration error. Please contact support.",
  RATE_LIMITED: "Too many calls. Please wait a few minutes before trying again.",
  
  // Contact list reminder
  SAVE_CONTACT_REMINDER: "For better calling reliability, please save +1 (678) 928-8816 as \"Cash Ridez Connect\" in your contacts.",
  
  // Generic fallback
  UNKNOWN: "We couldn't complete this call. Please try again or contact support.",
};

/**
 * Map backend error codes/messages to user-friendly messages
 */
function getUserFriendlyErrorMessage(error: string | undefined, code?: string): string {
  // Check for specific code first
  if (code && CALL_ERROR_MESSAGES[code]) {
    return CALL_ERROR_MESSAGES[code];
  }
  
  // Try to match error string to known patterns
  if (error) {
    const lowerError = error.toLowerCase();
    
    if (lowerError.includes('phone') && lowerError.includes('rider')) {
      return CALL_ERROR_MESSAGES.NO_RIDER_PHONE;
    }
    if (lowerError.includes('phone') && lowerError.includes('driver')) {
      return CALL_ERROR_MESSAGES.NO_DRIVER_PHONE;
    }
    if (lowerError.includes('phone')) {
      return CALL_ERROR_MESSAGES.NO_USER_PHONE;
    }
    if (lowerError.includes('assigned')) {
      return CALL_ERROR_MESSAGES.TRIP_NOT_ASSIGNED;
    }
    if (lowerError.includes('participant')) {
      return CALL_ERROR_MESSAGES.NOT_PARTICIPANT;
    }
    if (lowerError.includes('not found')) {
      return CALL_ERROR_MESSAGES.TRIP_NOT_FOUND;
    }
    if (lowerError.includes('unauthorized') || lowerError.includes('auth')) {
      return CALL_ERROR_MESSAGES.UNAUTHORIZED;
    }
    if (lowerError.includes('configuration') || lowerError.includes('config')) {
      return CALL_ERROR_MESSAGES.SERVER_CONFIG_ERROR;
    }
    if (lowerError.includes('busy')) {
      return CALL_ERROR_MESSAGES.CALL_BUSY;
    }
    if (lowerError.includes('declined') || lowerError.includes('rejected')) {
      return CALL_ERROR_MESSAGES.CALL_DECLINED;
    }
  }
  
  return CALL_ERROR_MESSAGES.UNKNOWN;
}

interface MaskedCallButtonProps {
  tripId: string;
  userRole: "rider" | "driver";
  tripStatus: string;
  disabled?: boolean;
  className?: string;
}

export function MaskedCallButton({ tripId, userRole, tripStatus, disabled, className }: MaskedCallButtonProps) {
  const { toast } = useToast();
  const [isInitiating, setIsInitiating] = useState(false);
  const [lastCallStatus, setLastCallStatus] = useState<string | null>(null);
  const [userHasPhone, setUserHasPhone] = useState<boolean | null>(null);

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

  // Check if current user has a phone number on mount
  const checkUserPhone = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setUserHasPhone(false);
      return;
    }
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('phone_number')
      .eq('id', user.id)
      .single();
    
    const hasPhone = !!(profile?.phone_number && profile.phone_number.trim().length > 0);
    setUserHasPhone(hasPhone);
  };

  useEffect(() => {
    fetchLastCall();
    checkUserPhone();
    
    // Subscribe to changes in calls table for this trip
    const channel = supabase
      .channel(`calls-${tripId}-${Math.random().toString(36).slice(2, 10)}`)
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
      .subscribe((status, err) => {
        if (err) console.warn('[realtime] subscription error:', err);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId]);

  const handleCall = async () => {
    // Pre-call validation: Check if user has phone number
    if (userHasPhone === false) {
      toast({
        title: "Phone Number Required",
        description: CALL_ERROR_MESSAGES.NO_USER_PHONE,
        variant: "destructive",
      });
      console.warn('[MaskedCallButton] User attempted call without phone number');
      return;
    }

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
        console.error('[MaskedCallButton] Call failed:', { error: data.error, code: data.code });
        
        const userMessage = getUserFriendlyErrorMessage(data.error, data.code);
        
        toast({
          title: "Call Failed",
          description: userMessage,
          variant: "destructive",
        });
        return;
      }

      // Success case
      if (data?.success) {
        toast({
          title: "Call Initiated",
          description: "We're connecting your call. Answer the incoming call from our CashRidez number (+1 678-928-8816).",
          duration: 7000,
        });
        
        // Refresh call status after a few seconds
        setTimeout(() => fetchLastCall(), 3000);
      }
    } catch (error) {
      console.error('[MaskedCallButton] Unexpected call error:', error);
      toast({
        title: "Call Failed",
        description: CALL_ERROR_MESSAGES.UNKNOWN,
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
      className={className || "flex-1 h-9 px-2 text-xs"}
      title={statusMessage || (userHasPhone === false ? "Add phone number to your profile to use calling" : undefined)}
    >
      <Phone className="h-3.5 w-3.5 mr-1.5" />
      {isInitiating ? "Connecting..." : buttonText}
    </Button>
  );
}
