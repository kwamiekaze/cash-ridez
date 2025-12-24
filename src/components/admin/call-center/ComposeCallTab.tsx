import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const ComposeCallTab = () => {
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'answered' | 'voicemail' | 'failed'>('idle');
  const [lastCallSid, setLastCallSid] = useState<string | null>(null);

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
          toast({
            title: "Call completed",
            description: "The call has ended.",
          });
        } else if (data.status === 'failed' || data.status === 'busy' || data.status === 'no-answer') {
          setCallStatus('failed');
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Make a Call
          </CardTitle>
          <CardDescription>
            Place an outbound call using the AI Voice Agent. The agent will wait for the human to speak first,
            then introduce CashRidez and guide them to text "CASH" for next steps.
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
                disabled={isLoading || callStatus === 'calling'}
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
                disabled={isLoading || callStatus === 'calling'}
              />
              <p className="text-xs text-muted-foreground">
                Used to personalize the greeting
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button
              onClick={handleCall}
              disabled={isLoading || callStatus === 'calling' || callStatus === 'answered'}
              className="gap-2"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Phone className="w-4 h-4" />
              )}
              {isLoading ? 'Initiating...' : 'Call Now'}
            </Button>

            {callStatus !== 'idle' && (
              <div className="flex items-center gap-2 text-sm">
                {getStatusIcon()}
                <span>{getStatusText()}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI Agent Info */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">🤖 AI Agent Behavior</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p><strong>When answered by human:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Waits for human to greet first</li>
            <li>Introduces as "Cash Ridez Connect LLC"</li>
            <li>Explains we're following up from Indeed</li>
            <li>Answers questions about CashRidez platform</li>
            <li>Guides to text "CASH" for next steps</li>
          </ul>
          <p><strong>When voicemail detected:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Leaves personalized voicemail</li>
            <li>Mentions Indeed application</li>
            <li>Requests they text "CASH" to continue</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default ComposeCallTab;
