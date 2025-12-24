import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, Loader2, CheckCircle2, XCircle, AlertCircle, PhoneOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const ComposeCallTab = () => {
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'answered' | 'voicemail' | 'failed'>('idle');
  const [lastCallSid, setLastCallSid] = useState<string | null>(null);
  const [lastCallLogId, setLastCallLogId] = useState<string | null>(null);

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

        // Poll for call status updates
        pollCallStatus(data.callLogId);
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

  const pollCallStatus = async (callLogId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes max
    
    const poll = async () => {
      try {
        const { data, error } = await supabase
          .from('admin_call_logs')
          .select('status')
          .eq('id', callLogId)
          .single();

        if (error) return;

        if (data.status === 'answered' || data.status === 'in-progress') {
          setCallStatus('answered');
        } else if (data.status === 'voicemail') {
          setCallStatus('voicemail');
        } else if (data.status === 'completed') {
          setCallStatus('idle');
          setLastCallSid(null);
          setLastCallLogId(null);
          toast({
            title: "Call completed",
            description: "The call has ended.",
          });
        } else if (data.status === 'failed' || data.status === 'busy' || data.status === 'no-answer') {
          setCallStatus('failed');
          setLastCallSid(null);
          setLastCallLogId(null);
          toast({
            title: "Call ended",
            description: `Status: ${data.status}`,
            variant: "destructive",
          });
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 2000);
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    };

    poll();
  };

  const getStatusIcon = () => {
    switch (callStatus) {
      case 'calling':
        return <Loader2 className="w-5 h-5 animate-spin text-yellow-500" />;
      case 'answered':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'voicemail':
        return <AlertCircle className="w-5 h-5 text-orange-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    switch (callStatus) {
      case 'calling':
        return 'Calling...';
      case 'answered':
        return 'In Progress';
      case 'voicemail':
        return 'Voicemail Left';
      case 'failed':
        return 'Failed';
      default:
        return null;
    }
  };

  const isCallActive = callStatus === 'calling' || callStatus === 'answered';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Make a Call
          </CardTitle>
          <CardDescription>
            Place an outbound call. The call will deliver a short message and end automatically.
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
                Used to personalize the greeting
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
            "Hey [Name], this is Cash Ridez Connect LLC. We responded on Indeed as well, please reply CASH for the next steps. Goodbye."
          </blockquote>
          <p className="text-xs">
            The call uses a male voice and ends automatically after the message.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ComposeCallTab;
