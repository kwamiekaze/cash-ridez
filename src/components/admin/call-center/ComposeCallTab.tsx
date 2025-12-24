import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, Loader2, CheckCircle2, XCircle, AlertCircle, PhoneOff, Home } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import VoicemailAudioTest from "./VoicemailAudioTest";

// Estimated script duration in seconds (based on exact script text)
// Script: ~45 words at ~150 words/min = ~18 seconds + 3 second pause = ~21 seconds
const ESTIMATED_SCRIPT_DURATION_SECONDS = 21;
// Real hangup is 3 seconds after script
const REAL_HANGUP_BUFFER_SECONDS = 3;
// UI failsafe is +5 seconds after expected real hangup (does NOT change real hangup)
const UI_FAILSAFE_BUFFER_SECONDS = 5;

const ComposeCallTab = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'ringing' | 'answered' | 'voicemail' | 'failed' | 'completed'>('idle');
  const [lastCallSid, setLastCallSid] = useState<string | null>(null);
  const [lastCallLogId, setLastCallLogId] = useState<string | null>(null);
  const failsafeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to realtime updates for call status
  useEffect(() => {
    if (!lastCallLogId) return;

    console.log('Subscribing to realtime updates for call:', lastCallLogId);

    const channel = supabase
      .channel(`call-status-${lastCallLogId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'admin_call_logs',
          filter: `id=eq.${lastCallLogId}`,
        },
        (payload) => {
          console.log('Realtime call status update:', payload);
          const newStatus = payload.new?.status;
          handleStatusUpdate(newStatus, payload.new);
        }
      )
      .subscribe();

    return () => {
      console.log('Unsubscribing from realtime updates');
      supabase.removeChannel(channel);
    };
  }, [lastCallLogId]);

  // Cleanup failsafe timer on unmount
  useEffect(() => {
    return () => {
      if (failsafeTimerRef.current) {
        clearTimeout(failsafeTimerRef.current);
      }
    };
  }, []);

  const handleStatusUpdate = useCallback((status: string, callData: any) => {
    console.log('Processing status update:', status);
    
    // Clear failsafe timer on any final status
    if (['completed', 'failed', 'busy', 'no-answer', 'voicemail'].includes(status)) {
      if (failsafeTimerRef.current) {
        clearTimeout(failsafeTimerRef.current);
        failsafeTimerRef.current = null;
      }
    }
    
    switch (status) {
      case 'ringing':
        setCallStatus('ringing');
        break;
      case 'answered':
      case 'in-progress':
        setCallStatus('answered');
        break;
      case 'voicemail':
        setCallStatus('voicemail');
        toast({
          title: "Voicemail left",
          description: "Message was left on voicemail",
        });
        // Reset after 2 seconds
        setTimeout(() => {
          setCallStatus('idle');
          setLastCallSid(null);
          setLastCallLogId(null);
        }, 2000);
        break;
      case 'completed':
        setCallStatus('completed');
        toast({
          title: "Call completed",
          description: callData?.call_duration_seconds 
            ? `Duration: ${Math.floor(callData.call_duration_seconds / 60)}:${(callData.call_duration_seconds % 60).toString().padStart(2, '0')}`
            : "The call has ended.",
        });
        setTimeout(() => {
          setCallStatus('idle');
          setLastCallSid(null);
          setLastCallLogId(null);
        }, 2000);
        break;
      case 'failed':
      case 'busy':
      case 'no-answer':
        setCallStatus('failed');
        setLastCallSid(null);
        setLastCallLogId(null);
        toast({
          title: "Call ended",
          description: `Status: ${status}`,
          variant: "destructive",
        });
        break;
      default:
        // Keep current status for ringing, initiated, etc.
        break;
    }
  }, [toast]);

  const normalizePhone = (phone: string): string => {
    // Remove all non-digit characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');
    
    // If it doesn't start with +, assume US
    if (!cleaned.startsWith('+')) {
      if (cleaned.startsWith('1') && cleaned.length === 11) {
        cleaned = '+' + cleaned;
      } else if (cleaned.length === 10) {
        cleaned = '+1' + cleaned;
      } else {
        cleaned = '+1' + cleaned;
      }
    }
    
    return cleaned;
  };

  const handleCall = async () => {
    if (!phoneNumber.trim()) {
      toast({
        title: "Phone number required",
        description: "Please enter a phone number to call.",
        variant: "destructive",
      });
      return;
    }

    const normalizedPhone = normalizePhone(phoneNumber);
    
    // Basic validation
    if (normalizedPhone.length < 10) {
      toast({
        title: "Invalid phone number",
        description: "Please enter a valid phone number.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setCallStatus('calling');

    try {
      const { data, error } = await supabase.functions.invoke('call-center-initiate', {
        body: {
          phoneE164: normalizedPhone,
          firstName: firstName.trim() || undefined,
        },
      });

      if (error) throw error;

      if (data.success) {
        setLastCallSid(data.callSid);
        setLastCallLogId(data.callLogId);
        toast({
          title: "Call initiated",
          description: `Calling ${normalizedPhone}...`,
        });

        // Start UI failsafe timer
        // Estimated total time: script duration + 3 sec real hangup + 5 sec UI buffer
        const failsafeDelayMs = (ESTIMATED_SCRIPT_DURATION_SECONDS + REAL_HANGUP_BUFFER_SECONDS + UI_FAILSAFE_BUFFER_SECONDS) * 1000;
        
        console.log(`Starting UI failsafe timer: ${failsafeDelayMs}ms (${ESTIMATED_SCRIPT_DURATION_SECONDS}s script + ${REAL_HANGUP_BUFFER_SECONDS}s hangup + ${UI_FAILSAFE_BUFFER_SECONDS}s UI buffer)`);
        
        failsafeTimerRef.current = setTimeout(async () => {
          console.log('UI failsafe triggered - checking final status');
          
          // Re-fetch latest status from DB
          try {
            const { data: callLog } = await supabase
              .from('admin_call_logs')
              .select('status, call_duration_seconds')
              .eq('id', data.callLogId)
              .single();
            
            if (callLog) {
              if (['completed', 'failed', 'busy', 'no-answer', 'voicemail'].includes(callLog.status)) {
                console.log('Failsafe: Call already in final state:', callLog.status);
                handleStatusUpdate(callLog.status, callLog);
              } else {
                // Still showing in-progress but should have ended by now - mark as completed in UI only
                console.log('Failsafe: Forcing UI to completed state (call may have ended but status not received)');
                setCallStatus('completed');
                toast({
                  title: "Call ended",
                  description: "The call has completed.",
                });
                setTimeout(() => {
                  setCallStatus('idle');
                  setLastCallSid(null);
                  setLastCallLogId(null);
                }, 2000);
              }
            }
          } catch (err) {
            console.error('Failsafe status check error:', err);
            // Force UI reset
            setCallStatus('idle');
            setLastCallSid(null);
            setLastCallLogId(null);
          }
        }, failsafeDelayMs);

      } else {
        throw new Error(data.error || 'Failed to initiate call');
      }

    } catch (error: any) {
      console.error('Call error:', error);
      setCallStatus('failed');
      toast({
        title: "Call failed",
        description: error.message || "Failed to initiate call",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndCall = async () => {
    if (!lastCallSid && !lastCallLogId) {
      toast({
        title: "No active call",
        description: "There is no call to end.",
        variant: "destructive",
      });
      return;
    }

    setIsEnding(true);

    try {
      const { data, error } = await supabase.functions.invoke('call-center-end', {
        body: {
          callSid: lastCallSid,
          callLogId: lastCallLogId,
        },
      });

      if (error) throw error;

      if (data.success) {
        // Clear failsafe timer
        if (failsafeTimerRef.current) {
          clearTimeout(failsafeTimerRef.current);
          failsafeTimerRef.current = null;
        }
        
        setCallStatus('idle');
        setLastCallSid(null);
        setLastCallLogId(null);
        toast({
          title: "Call ended",
          description: "The call has been terminated.",
        });
      } else {
        throw new Error(data.error || 'Failed to end call');
      }

    } catch (error: any) {
      console.error('End call error:', error);
      toast({
        title: "Failed to end call",
        description: error.message || "Could not end the call",
        variant: "destructive",
      });
    } finally {
      setIsEnding(false);
    }
  };

  const getStatusIcon = () => {
    switch (callStatus) {
      case 'calling':
      case 'ringing':
        return <Loader2 className="w-5 h-5 animate-spin text-yellow-500" />;
      case 'answered':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'voicemail':
        return <AlertCircle className="w-5 h-5 text-orange-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    switch (callStatus) {
      case 'calling':
        return 'Initiating...';
      case 'ringing':
        return 'Ringing...';
      case 'answered':
        return 'In Progress';
      case 'voicemail':
        return 'Voicemail Left';
      case 'failed':
        return 'Failed';
      case 'completed':
        return 'Completed';
      default:
        return null;
    }
  };

  const isCallActive = callStatus === 'calling' || callStatus === 'ringing' || callStatus === 'answered';

  return (
    <div className="space-y-6">
      {/* Return to Home Button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => navigate('/admin')}
          className="gap-2"
        >
          <Home className="w-4 h-4" />
          Return to Dashboard
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Make a Call
          </CardTitle>
          <CardDescription>
            Place an outbound call. The call will deliver a short message and end automatically after 3 seconds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+1 (470) 444-7481"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={isLoading || isCallActive}
              />
              <p className="text-xs text-muted-foreground">
                Enter in any format - will be normalized automatically
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name (optional)</Label>
              <Input
                id="firstName"
                placeholder="John"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isLoading || isCallActive}
              />
              <p className="text-xs text-muted-foreground">
                Used to personalize the greeting ("Hey John" vs "Hey there")
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button
              onClick={handleCall}
              disabled={isLoading || isCallActive}
              className="gap-2"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Phone className="w-4 h-4" />
              )}
              {isLoading ? 'Initiating...' : 'Call Now'}
            </Button>

            {isCallActive && (
              <Button
                onClick={handleEndCall}
                disabled={isEnding}
                variant="destructive"
                className="gap-2"
              >
                {isEnding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PhoneOff className="w-4 h-4" />
                )}
                End Call
              </Button>
            )}

            {callStatus !== 'idle' && (
              <div className="flex items-center gap-2 text-sm">
                {getStatusIcon()}
                <span>{getStatusText()}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Script Info */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">📞 Call Script</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p><strong>What the caller will hear:</strong></p>
          <blockquote className="border-l-2 border-primary pl-4 italic">
            "Hey [Name], this is Cash Ridez Connect LLC. We responded on Indeed as well. Please text us back with the word CASH for the next steps. We look forward to your text, thank you."
          </blockquote>
          <p className="text-xs">
            The call uses the same ElevenLabs male voice for all scenarios (answered, voicemail) and ends automatically after a 3 second pause following the script.
          </p>
        </CardContent>
      </Card>

      {/* Voicemail Audio Test */}
      <VoicemailAudioTest />
    </div>
  );
};

export default ComposeCallTab;
