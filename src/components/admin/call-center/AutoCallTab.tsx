import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, Play, Pause, X, Users, Phone, CheckCircle2, XCircle, Clock, Voicemail, Loader2, PhoneOff } from "lucide-react";
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

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    if (!activeCampaign) return;

    // Subscribe to campaign and recipient updates
    const channel = supabase
      .channel('campaign-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_call_campaign_recipients',
          filter: `campaign_id=eq.${activeCampaign.id}`,
        },
        () => {
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
        () => {
          loadCampaignDetails(activeCampaign.id);
        }
      )
      .subscribe();

    // Initial load of active recipient
    loadActiveRecipient(activeCampaign.id);

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeCampaign?.id]);

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
    // Find the recipient currently being called
    const { data } = await supabase
      .from('admin_call_campaign_recipients')
      .select('id, first_name, phone_e164, status, twilio_call_sid')
      .eq('campaign_id', campaignId)
      .in('status', ['calling', 'ringing', 'in-progress'])
      .limit(1)
      .single();

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
        setActiveRecipient(null);
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
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{activeCampaign.name}</span>
              {getStatusBadge(activeCampaign.status)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Currently Calling Indicator */}
            {activeRecipient && activeCampaign.status === 'running' && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-yellow-500 animate-pulse" />
                    <span className="text-sm font-medium">
                      Calling: {activeRecipient.first_name || 'Unknown'} ({activeRecipient.phone_e164})
                    </span>
                    <Badge variant="outline" className="text-xs">{activeRecipient.status}</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleEndActiveCall}
                    disabled={isEndingCall}
                    className="gap-1"
                  >
                    {isEndingCall ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <PhoneOff className="w-3 h-3" />
                    )}
                    End Call
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {activeCampaign.status === 'draft' && (
                <Button onClick={() => updateCampaignStatus(activeCampaign.id, 'running')} className="gap-2">
                  <Play className="w-4 h-4" />
                  Start Campaign
                </Button>
              )}
              {activeCampaign.status === 'running' && (
                <Button onClick={() => updateCampaignStatus(activeCampaign.id, 'paused')} variant="outline" className="gap-2">
                  <Pause className="w-4 h-4" />
                  Pause
                </Button>
              )}
              {activeCampaign.status === 'paused' && (
                <Button onClick={() => updateCampaignStatus(activeCampaign.id, 'running')} className="gap-2">
                  <Play className="w-4 h-4" />
                  Resume
                </Button>
              )}
              {(activeCampaign.status === 'running' || activeCampaign.status === 'paused') && (
                <Button onClick={() => updateCampaignStatus(activeCampaign.id, 'cancelled')} variant="destructive" className="gap-2">
                  <X className="w-4 h-4" />
                  Cancel Campaign
                </Button>
              )}
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">{activeCampaign.total_recipients}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{activeCampaign.queued_count}</p>
                  <p className="text-xs text-muted-foreground">Queued</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-500">{activeCampaign.answered_count}</p>
                  <p className="text-xs text-muted-foreground">Answered</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-orange-500">{activeCampaign.voicemail_count}</p>
                  <p className="text-xs text-muted-foreground">Voicemail</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-500">{activeCampaign.failed_count}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>
            </div>

            <Progress value={progress} className="h-2" />
            <p className="text-xs text-center text-muted-foreground">
              {Math.round(progress)}% complete
            </p>
          </CardContent>
        </Card>
      )}

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
