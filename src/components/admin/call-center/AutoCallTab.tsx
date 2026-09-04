import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Upload, Play, Pause, X, Users, Phone, CheckCircle2, XCircle, Clock, Voicemail, Loader2, PhoneOff, ChevronDown, Bug } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Recipient {
  id?: string;
  firstName: string;
  phoneE164: string;
  phoneRaw: string;
  status: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_recipients: number;
  queued_count: number;
  called_count: number;
  answered_count: number;
  voicemail_count: number;
  failed_count: number;
  created_at: string;
}

interface ActiveRecipient {
  id: string;
  first_name: string | null;
  phone_e164: string;
  status: string;
  twilio_call_sid: string | null;
}

interface DebugLogEntry {
  timestamp: string;
  campaignId: string;
  phoneNumber: string;
  callSid: string | null;
  status: string;
  source: 'realtime' | 'poll' | 'failsafe' | 'manual';
}

// Failsafe constants
const CALL_FAILSAFE_TIMEOUT_MS = 75000; // 75 seconds max per call
const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds as backup

const AutoCallTab = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [activeRecipient, setActiveRecipient] = useState<ActiveRecipient | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [debugLog, setDebugLog] = useState<DebugLogEntry[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  
  const failsafeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addDebugLog = useCallback((entry: Omit<DebugLogEntry, 'timestamp'>) => {
    const logEntry: DebugLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };
    console.log('[AutoCall Debug]', logEntry);
    setDebugLog(prev => [logEntry, ...prev.slice(0, 49)]); // Keep last 50 entries
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (failsafeTimerRef.current) clearTimeout(failsafeTimerRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!activeCampaign) {
      // Clear timers when no campaign is active
      if (failsafeTimerRef.current) clearTimeout(failsafeTimerRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    // Subscribe to campaign and recipient updates
    const channel = supabase
      .channel(`campaign-updates-${activeCampaign.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_call_campaign_recipients',
          filter: `campaign_id=eq.${activeCampaign.id}`,
        },
        (payload) => {
          console.log('[AutoCall] Recipient update:', payload);
          const newData = payload.new as any;
          if (newData) {
            addDebugLog({
              campaignId: activeCampaign.id,
              phoneNumber: newData.phone_e164 || 'unknown',
              callSid: newData.twilio_call_sid || null,
              status: newData.status || 'unknown',
              source: 'realtime',
            });
          }
          loadCampaignDetails(activeCampaign.id);
          loadActiveRecipient(activeCampaign.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_call_campaigns',
          filter: `id=eq.${activeCampaign.id}`,
        },
        (payload) => {
          console.log('[AutoCall] Campaign update:', payload);
          loadCampaignDetails(activeCampaign.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'admin_call_logs',
          filter: `campaign_id=eq.${activeCampaign.id}`,
        },
        (payload) => {
          console.log('[AutoCall] Call log update:', payload);
          const newData = payload.new as any;
          if (newData) {
            addDebugLog({
              campaignId: activeCampaign.id,
              phoneNumber: newData.phone_e164 || 'unknown',
              callSid: newData.twilio_call_sid || null,
              status: newData.status || 'unknown',
              source: 'realtime',
            });
          }
          loadActiveRecipient(activeCampaign.id);
        }
      )
      .subscribe((status, err) => {
        if (err) console.warn('[realtime] subscription error:', err);
      });

    // Initial load of active recipient
    loadActiveRecipient(activeCampaign.id);

    // Start polling as a backup for realtime
    pollTimerRef.current = setInterval(() => {
      if (activeCampaign.status === 'running') {
        loadCampaignDetails(activeCampaign.id);
        loadActiveRecipient(activeCampaign.id);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      supabase.removeChannel(channel);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [activeCampaign?.id, activeCampaign?.status, addDebugLog]);

  // Failsafe timer for stuck calls
  useEffect(() => {
    if (!activeRecipient || !activeCampaign) {
      if (failsafeTimerRef.current) {
        clearTimeout(failsafeTimerRef.current);
        failsafeTimerRef.current = null;
      }
      return;
    }

    // If there's an active call, start failsafe timer
    if (['calling', 'ringing', 'in-progress'].includes(activeRecipient.status)) {
      console.log('[AutoCall] Starting failsafe timer for:', activeRecipient.phone_e164);
      
      if (failsafeTimerRef.current) clearTimeout(failsafeTimerRef.current);
      
      failsafeTimerRef.current = setTimeout(async () => {
        console.log('[AutoCall] Failsafe triggered for stuck call:', activeRecipient.phone_e164);
        
        addDebugLog({
          campaignId: activeCampaign.id,
          phoneNumber: activeRecipient.phone_e164,
          callSid: activeRecipient.twilio_call_sid,
          status: 'failsafe-timeout',
          source: 'failsafe',
        });

        // Force mark the recipient as failed
        await supabase
          .from('admin_call_campaign_recipients')
          .update({
            status: 'failed',
            call_ended_at: new Date().toISOString(),
            error_message: 'Failsafe timeout - no status update received',
          })
          .eq('id', activeRecipient.id);

        // Reload state
        loadCampaignDetails(activeCampaign.id);
        loadActiveRecipient(activeCampaign.id);

        toast({
          title: "Call timeout",
          description: "Call marked as failed due to timeout. Campaign will proceed.",
          variant: "destructive",
        });
      }, CALL_FAILSAFE_TIMEOUT_MS);
    }

    return () => {
      if (failsafeTimerRef.current) {
        clearTimeout(failsafeTimerRef.current);
        failsafeTimerRef.current = null;
      }
    };
  }, [activeRecipient?.id, activeRecipient?.status, activeCampaign?.id, addDebugLog, toast]);

  const loadCampaigns = async () => {
    const { data, error } = await supabase
      .from('admin_call_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) {
      setCampaigns(data);
    }
  };

  const loadCampaignDetails = async (campaignId: string) => {
    const { data } = await supabase
      .from('admin_call_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (data) {
      setActiveCampaign(data);
    }
  };

  const loadActiveRecipient = async (campaignId: string) => {
    // Find the recipient currently being called (active non-terminal status)
    const { data } = await supabase
      .from('admin_call_campaign_recipients')
      .select('id, first_name, phone_e164, status, twilio_call_sid')
      .eq('campaign_id', campaignId)
      .in('status', ['calling', 'ringing', 'in-progress'])
      .order('last_attempt_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // If no active call found, check if we had one before and log the terminal state
    if (!data && activeRecipient) {
      addDebugLog({
        campaignId,
        phoneNumber: activeRecipient.phone_e164,
        callSid: activeRecipient.twilio_call_sid,
        status: 'cleared-from-active',
        source: 'poll',
      });
    }

    setActiveRecipient(data || null);
  };

  const normalizePhone = (phone: string): string | null => {
    // Remove all non-digit characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');
    
    // If empty or too short
    if (cleaned.length < 10) return null;
    
    // If it doesn't start with +, assume US
    if (!cleaned.startsWith('+')) {
      if (cleaned.startsWith('1') && cleaned.length === 11) {
        cleaned = '+' + cleaned;
      } else if (cleaned.length === 10) {
        cleaned = '+1' + cleaned;
      } else if (cleaned.length > 10) {
        cleaned = '+' + cleaned;
      }
    }
    
    // Validate E.164 format
    if (!/^\+\d{10,15}$/.test(cleaned)) {
      return null;
    }
    
    return cleaned;
  };

  const parseLine = (line: string): Recipient | null => {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // Split by common delimiters
    const parts = trimmed.split(/[,\t]+/).map(p => p.trim()).filter(Boolean);
    
    let phone = '';
    let name = '';

    for (const part of parts) {
      const digits = part.replace(/[^\d+]/g, '');
      if (digits.length >= 10) {
        phone = part;
      } else if (part.length > 0 && !/^\d+$/.test(part)) {
        name = name ? `${name} ${part}` : part;
      }
    }

    // If no phone found in comma/tab separated, try space-separated
    if (!phone) {
      const spaceParts = trimmed.split(/\s+/);
      for (const part of spaceParts) {
        const digits = part.replace(/[^\d+]/g, '');
        if (digits.length >= 10) {
          phone = part;
          name = spaceParts.filter(p => p !== part).join(' ');
          break;
        }
      }
    }

    // Still no phone? The whole thing might be a phone number
    if (!phone) {
      const digits = trimmed.replace(/[^\d+]/g, '');
      if (digits.length >= 10) {
        phone = trimmed;
      }
    }

    if (!phone) return null;

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return null;

    const firstName = name.split(/\s+/)[0] || '';

    return {
      firstName,
      phoneE164: normalizedPhone,
      phoneRaw: phone,
      status: 'queued',
    };
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setParseErrors([]);

    try {
      const text = await file.text();
      const lines = text.split(/[\r\n]+/);
      
      const parsed: Recipient[] = [];
      const errors: string[] = [];
      const seenPhones = new Set<string>();

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const recipient = parseLine(line);
        if (recipient) {
          if (!seenPhones.has(recipient.phoneE164)) {
            seenPhones.add(recipient.phoneE164);
            parsed.push(recipient);
          }
        } else {
          errors.push(`Line ${i + 1}: Could not parse "${line.substring(0, 50)}..."`);
        }
      }

      setRecipients(parsed);
      setParseErrors(errors);

      toast({
        title: "File parsed",
        description: `${parsed.length} recipients found${errors.length ? `, ${errors.length} errors` : ''}`,
      });

    } catch (error) {
      console.error('Parse error:', error);
      toast({
        title: "Failed to parse file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const createCampaign = async () => {
    if (recipients.length === 0) {
      toast({
        title: "No recipients",
        description: "Please upload a file with phone numbers first.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);

    try {
      const { data: campaign, error: campaignError } = await supabase
        .from('admin_call_campaigns')
        .insert({
          created_by: user?.id,
          name: campaignName || `Campaign ${new Date().toLocaleDateString()}`,
          status: 'draft',
          total_recipients: recipients.length,
          queued_count: recipients.length,
        })
        .select()
        .single();

      if (campaignError) throw campaignError;

      const recipientRows = recipients.map(r => ({
        campaign_id: campaign.id,
        first_name: r.firstName || null,
        phone_raw: r.phoneRaw,
        phone_e164: r.phoneE164,
        status: 'queued',
      }));

      const { error: recipientsError } = await supabase
        .from('admin_call_campaign_recipients')
        .insert(recipientRows);

      if (recipientsError) throw recipientsError;

      toast({
        title: "Campaign created",
        description: `${recipients.length} recipients added to campaign.`,
      });

      setRecipients([]);
      setCampaignName("");
      loadCampaigns();
      setActiveCampaign(campaign);

    } catch (error: any) {
      console.error('Create campaign error:', error);
      toast({
        title: "Failed to create campaign",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const updateCampaignStatus = async (campaignId: string, status: string) => {
    try {
      const actionMap: Record<string, string> = {
        'running': activeCampaign?.status === 'paused' ? 'resume' : 'start',
        'paused': 'pause',
        'cancelled': 'stop',
      };

      const action = actionMap[status] || 'start';

      addDebugLog({
        campaignId,
        phoneNumber: '-',
        callSid: null,
        status: `action:${action}`,
        source: 'manual',
      });

      const { data, error } = await supabase.functions.invoke('call-center-outbound-start', {
        body: { campaignId, action },
      });

      if (error) throw error;

      toast({
        title: "Campaign updated",
        description: data?.message || `Campaign ${action} successful`,
      });

      loadCampaigns();
      if (activeCampaign?.id === campaignId) {
        loadCampaignDetails(campaignId);
      }
    } catch (err: any) {
      console.error('Campaign status update error:', err);
      toast({
        title: "Failed to update campaign",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleEndActiveCall = async () => {
    if (!activeRecipient?.twilio_call_sid) {
      toast({
        title: "No active call",
        description: "There is no call currently in progress.",
        variant: "destructive",
      });
      return;
    }

    setIsEndingCall(true);

    addDebugLog({
      campaignId: activeCampaign?.id || 'unknown',
      phoneNumber: activeRecipient.phone_e164,
      callSid: activeRecipient.twilio_call_sid,
      status: 'ending',
      source: 'manual',
    });

    try {
      const { data, error } = await supabase.functions.invoke('call-center-end', {
        body: {
          callSid: activeRecipient.twilio_call_sid,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Call ended",
          description: "The active call has been terminated.",
        });
        
        // Clear failsafe timer
        if (failsafeTimerRef.current) {
          clearTimeout(failsafeTimerRef.current);
          failsafeTimerRef.current = null;
        }
        
        setActiveRecipient(null);
        
        // Reload campaign details
        if (activeCampaign?.id) {
          loadCampaignDetails(activeCampaign.id);
        }
      } else {
        throw new Error(data.error || 'Failed to end call');
      }
    } catch (err: any) {
      console.error('End call error:', err);
      toast({
        title: "Failed to end call",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsEndingCall(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
      draft: { variant: "secondary", label: "Draft" },
      running: { variant: "default", label: "Running" },
      paused: { variant: "outline", label: "Paused" },
      completed: { variant: "secondary", label: "Completed" },
      cancelled: { variant: "destructive", label: "Cancelled" },
    };
    const config = variants[status] || { variant: "secondary", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const progress = activeCampaign
    ? ((activeCampaign.answered_count + activeCampaign.voicemail_count + activeCampaign.failed_count) / activeCampaign.total_recipients) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Create Call Campaign
          </CardTitle>
          <CardDescription>
            Upload a .txt or .csv file with phone numbers and optional names.
            Supports formats like "+1 470 444 7481 John" or "(470) 444-7481, John Doe"
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="campaignName">Campaign Name</Label>
              <Input
                id="campaignName"
                placeholder="Indeed Follow-up Batch 1"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="file">Upload Contact List</Label>
              <Input
                id="file"
                type="file"
                accept=".txt,.csv"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
            </div>
          </div>

          {parseErrors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
              <p className="text-sm font-medium text-destructive mb-2">Parse Errors:</p>
              <ScrollArea className="h-20">
                <ul className="text-xs text-destructive/80 space-y-1">
                  {parseErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}

          {recipients.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{recipients.length} recipients ready</p>
                <Button variant="ghost" size="sm" onClick={() => setRecipients([])}>
                  Clear
                </Button>
              </div>
              <ScrollArea className="h-32 border rounded-md p-2">
                <div className="space-y-1">
                  {recipients.slice(0, 50).map((r, i) => (
                    <div key={i} className="text-xs flex gap-2">
                      <span className="font-mono text-muted-foreground">{r.phoneE164}</span>
                      {r.firstName && <span>{r.firstName}</span>}
                    </div>
                  ))}
                  {recipients.length > 50 && (
                    <p className="text-xs text-muted-foreground">...and {recipients.length - 50} more</p>
                  )}
                </div>
              </ScrollArea>
              <Button onClick={createCampaign} disabled={isCreating} className="w-full">
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Users className="w-4 h-4 mr-2" />}
                Create Campaign
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaigns List */}
      <Card>
        <CardHeader>
          <CardTitle>Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No campaigns yet</p>
          ) : (
            <div className="space-y-3">
              {campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    activeCampaign?.id === campaign.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setActiveCampaign(campaign)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{campaign.name || 'Unnamed Campaign'}</h4>
                      {getStatusBadge(campaign.status)}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(campaign.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-5 gap-2 text-xs text-center">
                    <div>
                      <Users className="w-3 h-3 mx-auto mb-1" />
                      <span>{campaign.total_recipients}</span>
                    </div>
                    <div>
                      <Clock className="w-3 h-3 mx-auto mb-1" />
                      <span>{campaign.queued_count}</span>
                    </div>
                    <div>
                      <CheckCircle2 className="w-3 h-3 mx-auto mb-1 text-green-500" />
                      <span>{campaign.answered_count}</span>
                    </div>
                    <div>
                      <Voicemail className="w-3 h-3 mx-auto mb-1 text-orange-500" />
                      <span>{campaign.voicemail_count}</span>
                    </div>
                    <div>
                      <XCircle className="w-3 h-3 mx-auto mb-1 text-red-500" />
                      <span>{campaign.failed_count}</span>
                    </div>
                  </div>

                  <Progress 
                    value={((campaign.answered_count + campaign.voicemail_count + campaign.failed_count) / Math.max(campaign.total_recipients, 1)) * 100} 
                    className="h-1 mt-2" 
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Campaign Controls */}
      {activeCampaign && (
        <Card className="border-primary overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
              <span className="truncate min-w-0">{activeCampaign.name}</span>
              <span className="shrink-0">{getStatusBadge(activeCampaign.status)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {/* Currently Calling Indicator - show for any active campaign with an active recipient */}
            {activeRecipient && activeCampaign.status === 'running' && 
             ['calling', 'ringing', 'in-progress', 'answered'].includes(activeRecipient.status) && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 sm:p-4">
                {/* Mobile: 2-line layout, Desktop: single row */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  {/* Left: Call label with phone */}
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Phone className="w-4 h-4 text-yellow-500 animate-pulse shrink-0" />
                    <span className="text-sm font-medium truncate" title={`${activeRecipient.first_name || 'Unknown'} (${activeRecipient.phone_e164})`}>
                      Calling: {activeRecipient.first_name || 'Unknown'} ({activeRecipient.phone_e164})
                    </span>
                  </div>
                  
                  {/* Right: Status pill + End Call button */}
                  <div className="flex items-center justify-between gap-3 sm:justify-end sm:shrink-0">
                    <Badge variant="outline" className="text-xs shrink-0">{activeRecipient.status}</Badge>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleEndActiveCall}
                      disabled={isEndingCall || !activeRecipient.twilio_call_sid}
                      className="gap-1.5 h-9 px-3 min-w-[90px] max-w-[120px] shrink-0"
                    >
                      {isEndingCall ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <PhoneOff className="w-3.5 h-3.5" />
                      )}
                      <span>End Call</span>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Campaign control buttons - responsive grid */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
              {activeCampaign.status === 'draft' && (
                <Button 
                  onClick={() => updateCampaignStatus(activeCampaign.id, 'running')} 
                  className="gap-2 h-11 col-span-2 sm:col-span-1 sm:h-10"
                >
                  <Play className="w-4 h-4" />
                  Start Campaign
                </Button>
              )}
              {activeCampaign.status === 'running' && (
                <Button 
                  onClick={() => updateCampaignStatus(activeCampaign.id, 'paused')} 
                  variant="outline" 
                  className="gap-2 h-11 sm:h-10"
                >
                  <Pause className="w-4 h-4" />
                  Pause
                </Button>
              )}
              {activeCampaign.status === 'paused' && (
                <Button 
                  onClick={() => updateCampaignStatus(activeCampaign.id, 'running')} 
                  className="gap-2 h-11 sm:h-10"
                >
                  <Play className="w-4 h-4" />
                  Resume
                </Button>
              )}
              {(activeCampaign.status === 'running' || activeCampaign.status === 'paused') && (
                <Button 
                  onClick={() => updateCampaignStatus(activeCampaign.id, 'cancelled')} 
                  variant="destructive" 
                  className="gap-2 h-11 sm:h-10"
                >
                  <X className="w-4 h-4" />
                  Cancel Campaign
                </Button>
              )}
            </div>

            {/* Stats grid - responsive */}
            <div className="bg-muted/50 rounded-lg p-3 sm:p-4">
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 sm:gap-4 text-center">
                <div>
                  <p className="text-xl sm:text-2xl font-bold">{activeCampaign.total_recipients}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Total</p>
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold">{activeCampaign.queued_count}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Queued</p>
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-green-500">{activeCampaign.answered_count}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Answered</p>
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-orange-500">{activeCampaign.voicemail_count}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Voicemail</p>
                </div>
                <div className="col-span-3 sm:col-span-1">
                  <p className="text-xl sm:text-2xl font-bold text-red-500">{activeCampaign.failed_count}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Failed</p>
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-1.5">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">
                {Math.round(progress)}% complete
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debug Log Panel */}
      <Collapsible open={debugOpen} onOpenChange={setDebugOpen}>
        <Card className="border-muted">
          <CollapsibleTrigger className="w-full">
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardTitle className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Bug className="w-4 h-4" />
                  Campaign Debug Log
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${debugOpen ? 'rotate-180' : ''}`} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {debugLog.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No events logged yet</p>
              ) : (
                <ScrollArea className="h-48">
                  <div className="space-y-1 font-mono text-xs">
                    {debugLog.map((entry, i) => (
                      <div key={i} className="flex gap-2 py-1 border-b border-muted/50">
                        <span className="text-muted-foreground w-20 shrink-0">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                        <Badge variant="outline" className="w-16 justify-center shrink-0">{entry.source}</Badge>
                        <span className="text-primary shrink-0">{entry.status}</span>
                        <span className="truncate">{entry.phoneNumber}</span>
                        {entry.callSid && (
                          <span className="text-muted-foreground truncate">{entry.callSid.slice(-8)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Important Note */}
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            <strong>⚠️ Important:</strong> Auto Call campaigns are processed one call at a time. 
            Each call delivers a short message and ends automatically. All calls are recorded for compliance.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AutoCallTab;
