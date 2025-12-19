import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { 
  Upload, 
  Play, 
  Pause, 
  Square, 
  RefreshCw, 
  Send, 
  FileText, 
  Users, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Clock,
  Loader2,
  Eye
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { parseContactsFromText, parseContactsFromCSV, normalizePhoneToE164, type ParsedContact } from "@/lib/phoneParser";

// SMS character limits
const GSM7_SINGLE_LIMIT = 160;
const GSM7_MULTI_LIMIT = 153;
const UNICODE_SINGLE_LIMIT = 70;
const UNICODE_MULTI_LIMIT = 67;

interface ParsedRecipient extends ParsedContact {
  messageRendered?: string;
}

interface Campaign {
  id: string;
  created_at: string;
  name: string | null;
  sender: string;
  template: string;
  status: string;
  total_recipients: number;
  queued_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
}

interface CampaignRecipient {
  id: string;
  first_name: string | null;
  phone_e164: string;
  message_rendered: string;
  status: string;
  error: string | null;
  sent_at: string | null;
}

const OPT_OUT_TEXT = "\n\nReply STOP to opt out.";

export function AutoTextTab() {
  // Form state
  const [campaignName, setCampaignName] = useState("");
  const [template, setTemplate] = useState("Hi {first_name}, this is a message from CashRidez.");
  const [includeOptOut, setIncludeOptOut] = useState(true);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  
  // File upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedRecipients, setParsedRecipients] = useState<ParsedRecipient[]>([]);
  const [parsing, setParsing] = useState(false);
  
  // Campaign state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [recipientFilter, setRecipientFilter] = useState<string>("all");
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  
  // Action state
  const [creating, setCreating] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testPhone, setTestPhone] = useState("");

  // Calculate message info
  const calculateMessageInfo = (body: string, withOptOut: boolean) => {
    const fullMessage = withOptOut ? body + OPT_OUT_TEXT : body;
    const length = fullMessage.length;
    
    const gsm7Regex = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ!"#¤%&'()*+,\-.\/:;<=>?¡ÄÖÑÜ§¿äöñüà0-9A-Za-z{first_name}]*$/;
    const isGsm7 = gsm7Regex.test(body);
    
    const singleLimit = isGsm7 ? GSM7_SINGLE_LIMIT : UNICODE_SINGLE_LIMIT;
    const multiLimit = isGsm7 ? GSM7_MULTI_LIMIT : UNICODE_MULTI_LIMIT;
    
    let segments = 1;
    if (length > singleLimit) {
      segments = Math.ceil(length / multiLimit);
    }
    
    return { length, segments, isGsm7 };
  };

  const templateInfo = useMemo(() => {
    const sampleMessage = template.replace(/{first_name}/g, "John");
    return calculateMessageInfo(sampleMessage, includeOptOut);
  }, [template, includeOptOut]);

  // Render message with template
  const renderMessage = (tmpl: string, firstName: string | null, withOptOut: boolean): string => {
    let msg = tmpl.replace(/{first_name}/g, firstName || "there");
    if (withOptOut) msg += OPT_OUT_TEXT;
    return msg;
  };

  // Parse uploaded file using new robust parser
  const parseFile = async (file: File) => {
    setParsing(true);
    const text = await file.text();
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    
    const contacts = isCsv 
      ? parseContactsFromCSV(text) 
      : parseContactsFromText(text);
    
    // Add rendered messages to parsed contacts
    const parsed: ParsedRecipient[] = contacts.map(c => ({
      ...c,
      messageRendered: c.phoneE164 ? renderMessage(template, c.firstName, includeOptOut) : undefined
    }));
    
    setParsedRecipients(parsed);
    setParsing(false);
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      parseFile(file);
    }
  };

  // Re-render messages when template changes
  useEffect(() => {
    if (parsedRecipients.length > 0) {
      setParsedRecipients(prev => 
        prev.map(r => ({
          ...r,
          messageRendered: r.phoneE164 ? renderMessage(template, r.firstName, includeOptOut) : undefined
        }))
      );
    }
  }, [template, includeOptOut]);

  // Stats from parsed recipients
  const validCount = parsedRecipients.filter(r => r.valid).length;
  const invalidCount = parsedRecipients.filter(r => !r.valid).length;

  // Load campaigns
  const fetchCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    const { data, error } = await supabase
      .from("admin_sms_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    
    if (error) {
      console.error("Failed to load campaigns:", error);
    } else {
      setCampaigns((data || []) as Campaign[]);
    }
    setLoadingCampaigns(false);
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Load recipients for selected campaign
  const fetchRecipients = useCallback(async (campaignId: string) => {
    setLoadingRecipients(true);
    const { data, error } = await supabase
      .from("admin_sms_campaign_recipients")
      .select("id, first_name, phone_e164, message_rendered, status, error, sent_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .limit(500);
    
    if (error) {
      console.error("Failed to load recipients:", error);
    } else {
      setRecipients((data || []) as CampaignRecipient[]);
    }
    setLoadingRecipients(false);
  }, []);

  useEffect(() => {
    if (selectedCampaign) {
      fetchRecipients(selectedCampaign.id);
    }
  }, [selectedCampaign, fetchRecipients]);

  // Realtime subscriptions
  useEffect(() => {
    const campaignChannel = supabase
      .channel('campaign-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_sms_campaigns' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setCampaigns(prev => 
              prev.map(c => c.id === (payload.new as Campaign).id ? payload.new as Campaign : c)
            );
            if (selectedCampaign?.id === (payload.new as Campaign).id) {
              setSelectedCampaign(payload.new as Campaign);
            }
          } else if (payload.eventType === 'INSERT') {
            setCampaigns(prev => [payload.new as Campaign, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(campaignChannel);
    };
  }, [selectedCampaign]);

  useEffect(() => {
    if (!selectedCampaign) return;

    const recipientChannel = supabase
      .channel(`recipient-changes-${selectedCampaign.id}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'admin_sms_campaign_recipients',
          filter: `campaign_id=eq.${selectedCampaign.id}`
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setRecipients(prev => 
              prev.map(r => r.id === (payload.new as CampaignRecipient).id ? payload.new as CampaignRecipient : r)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(recipientChannel);
    };
  }, [selectedCampaign]);

  // Create campaign
  const handleCreateCampaign = async () => {
    if (!consentConfirmed) {
      toast({ title: "Consent Required", description: "Please confirm recipients have consent", variant: "destructive" });
      return;
    }

    if (validCount === 0) {
      toast({ title: "No Recipients", description: "Upload a file with valid phone numbers", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create campaign
      const { data: campaign, error: campaignError } = await supabase
        .from("admin_sms_campaigns")
        .insert({
          created_by: user.id,
          name: campaignName || null,
          sender: "messaging_service",
          template,
          opt_out_footer_enabled: includeOptOut,
          opt_out_footer_text: OPT_OUT_TEXT.trim(),
          status: "running",
          total_recipients: validCount,
          queued_count: validCount,
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      if (campaignError) throw campaignError;

      // Insert recipients
      const validRecipients = parsedRecipients.filter(r => r.valid);
      const recipientRows = validRecipients.map(r => ({
        campaign_id: campaign.id,
        raw_line: r.rawLine,
        first_name: r.firstName,
        phone_raw: r.phoneRaw,
        phone_e164: r.phoneE164!,
        message_rendered: r.messageRendered!,
        status: "queued"
      }));

      const { error: recipError } = await supabase
        .from("admin_sms_campaign_recipients")
        .insert(recipientRows);

      if (recipError) throw recipError;

      toast({ 
        title: "Campaign Started", 
        description: `Sending to ${validCount} recipients. Messages will appear in the Inbox.` 
      });

      // Kick off the worker
      await supabase.functions.invoke('admin-bulk-sms-runner', {
        body: { campaign_id: campaign.id }
      });

      // Reset form
      setCampaignName("");
      setUploadedFile(null);
      setParsedRecipients([]);
      setConsentConfirmed(false);
      
      // Select the new campaign
      setSelectedCampaign(campaign as Campaign);
      fetchCampaigns();

    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // Pause/Resume/Cancel campaign
  const handlePauseCampaign = async () => {
    if (!selectedCampaign) return;
    await supabase
      .from("admin_sms_campaigns")
      .update({ status: "paused" })
      .eq("id", selectedCampaign.id);
  };

  const handleResumeCampaign = async () => {
    if (!selectedCampaign) return;
    await supabase
      .from("admin_sms_campaigns")
      .update({ status: "running" })
      .eq("id", selectedCampaign.id);
    
    // Kick worker
    await supabase.functions.invoke('admin-bulk-sms-runner', {
      body: { campaign_id: selectedCampaign.id }
    });
  };

  const handleCancelCampaign = async () => {
    if (!selectedCampaign) return;
    await supabase
      .from("admin_sms_campaigns")
      .update({ status: "canceled", finished_at: new Date().toISOString() })
      .eq("id", selectedCampaign.id);
  };

  // Send test SMS
  const handleSendTest = async () => {
    const phoneE164 = normalizePhoneToE164(testPhone);
    if (!phoneE164) {
      toast({ title: "Invalid Phone", description: "Enter a valid phone number", variant: "destructive" });
      return;
    }

    setSendingTest(true);
    try {
      const testMessage = renderMessage(template, "Test", includeOptOut);
      const { data, error } = await supabase.functions.invoke('admin-send-sms', {
        body: { to: phoneE164, body: testMessage.replace(OPT_OUT_TEXT, ''), includeOptOut }
      });

      if (error) throw error;
      if (data?.ok) {
        toast({ title: "Test Sent", description: `Sent to ${phoneE164}` });
      } else {
        toast({ title: "Failed", description: data?.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSendingTest(false);
    }
  };

  // Filtered recipients
  const filteredRecipients = useMemo(() => {
    if (recipientFilter === "all") return recipients;
    return recipients.filter(r => r.status === recipientFilter);
  }, [recipients, recipientFilter]);

  // Status badge helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running": return <Badge className="bg-green-600">Running</Badge>;
      case "paused": return <Badge className="bg-yellow-600">Paused</Badge>;
      case "completed": return <Badge className="bg-blue-600">Completed</Badge>;
      case "canceled": return <Badge variant="secondary">Canceled</Badge>;
      case "failed": return <Badge variant="destructive">Failed</Badge>;
      case "draft": return <Badge variant="outline">Draft</Badge>;
      case "sent": return <Badge className="bg-green-600">Sent</Badge>;
      case "queued": return <Badge variant="secondary">Queued</Badge>;
      case "sending": return <Badge className="bg-blue-600">Sending</Badge>;
      case "skipped": return <Badge variant="outline">Skipped</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Calculate ETA
  const calculateEta = (campaign: Campaign) => {
    const remaining = campaign.queued_count;
    const perMinute = 25;
    const minutes = Math.ceil(remaining / perMinute);
    if (minutes < 60) return `~${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `~${hours}h ${mins}m`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Create Campaign */}
      <Card className="bg-card/80 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Create Campaign
          </CardTitle>
          <CardDescription>Upload contacts and send bulk SMS</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Campaign Name */}
          <div className="space-y-2">
            <Label>Campaign Name (optional)</Label>
            <Input
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="e.g., December Promo"
            />
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label>Upload Contact List (.txt or .csv)</Label>
            <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
              <input
                type="file"
                accept=".txt,.csv"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                {uploadedFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-5 w-5" />
                    <span>{uploadedFile.name}</span>
                  </div>
                ) : (
                  <div className="text-muted-foreground">
                    <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Click to upload or drag and drop</p>
                    <p className="text-xs">.txt or .csv files</p>
                  </div>
                )}
              </label>
            </div>
            {parsing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Parsing file...
              </div>
            )}
            {parsedRecipients.length > 0 && (
              <div className="flex items-center gap-4 text-sm">
                <span className="text-green-500 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  {validCount} valid
                </span>
                {invalidCount > 0 && (
                  <span className="text-yellow-500 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {invalidCount} skipped
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Message Template */}
          <div className="space-y-2">
            <Label>Message Template</Label>
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Hi {first_name}, ..."
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Use {"{first_name}"} for personalization
            </p>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{templateInfo.length} chars • {templateInfo.segments} segment(s)</span>
              {templateInfo.segments > 3 && (
                <span className="text-yellow-500">⚠️ Long message ({templateInfo.segments} segments)</span>
              )}
            </div>
          </div>

          {/* Opt-out toggle */}
          <div className="flex items-center space-x-2">
            <Switch
              id="opt-out"
              checked={includeOptOut}
              onCheckedChange={setIncludeOptOut}
            />
            <Label htmlFor="opt-out" className="text-sm cursor-pointer">
              Include opt-out footer
            </Label>
          </div>

          {/* Preview */}
          {parsedRecipients.filter(r => r.valid).length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Preview (first 3)
              </Label>
              <div className="space-y-2">
                {parsedRecipients.filter(r => r.valid).slice(0, 3).map((r, i) => (
                  <div key={i} className="text-xs bg-muted/50 p-2 rounded">
                    <span className="text-muted-foreground">To: {r.phoneE164}</span>
                    <p className="mt-1">{r.messageRendered}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Send Test */}
          <div className="space-y-2 pt-2 border-t border-border/50">
            <Label>Send Test SMS</Label>
            <div className="flex gap-2">
              <Input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="Your phone number"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSendTest}
                disabled={sendingTest || !testPhone}
              >
                {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Consent checkbox */}
          <div className="flex items-start space-x-2 pt-2">
            <Checkbox
              id="consent"
              checked={consentConfirmed}
              onCheckedChange={(c) => setConsentConfirmed(c === true)}
            />
            <Label htmlFor="consent" className="text-sm cursor-pointer leading-tight">
              I confirm all recipients have given consent to receive SMS from CashRidez.
            </Label>
          </div>

          {/* Start Campaign */}
          <Button
            onClick={handleCreateCampaign}
            disabled={creating || !consentConfirmed || validCount === 0}
            className="w-full"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Start Campaign ({validCount} recipients)
          </Button>
        </CardContent>
      </Card>

      {/* Right: Campaign Progress */}
      <Card className="bg-card/80 backdrop-blur-sm border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Campaigns
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={fetchCampaigns}>
              <RefreshCw className={cn("h-4 w-4", loadingCampaigns && "animate-spin")} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Campaign List */}
          <ScrollArea className="h-32">
            <div className="space-y-2">
              {campaigns.map((campaign) => (
                <button
                  key={campaign.id}
                  onClick={() => setSelectedCampaign(campaign)}
                  className={cn(
                    "w-full text-left p-2 rounded border transition-colors",
                    selectedCampaign?.id === campaign.id 
                      ? "border-primary bg-primary/10" 
                      : "border-transparent hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">
                      {campaign.name || `Campaign ${campaign.id.slice(0, 8)}`}
                    </span>
                    {getStatusBadge(campaign.status)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {campaign.sent_count}/{campaign.total_recipients} sent • {format(new Date(campaign.created_at), 'MMM d, h:mm a')}
                  </div>
                </button>
              ))}
              {campaigns.length === 0 && !loadingCampaigns && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No campaigns yet
                </p>
              )}
            </div>
          </ScrollArea>

          {/* Selected Campaign Details */}
          {selectedCampaign && (
            <div className="space-y-4 pt-4 border-t border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">
                    {selectedCampaign.name || `Campaign ${selectedCampaign.id.slice(0, 8)}`}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusBadge(selectedCampaign.status)}
                    {selectedCampaign.status === 'running' && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        ETA: {calculateEta(selectedCampaign)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {selectedCampaign.status === 'running' && (
                    <Button size="sm" variant="outline" onClick={handlePauseCampaign}>
                      <Pause className="h-4 w-4" />
                    </Button>
                  )}
                  {selectedCampaign.status === 'paused' && (
                    <Button size="sm" variant="outline" onClick={handleResumeCampaign}>
                      <Play className="h-4 w-4" />
                    </Button>
                  )}
                  {['running', 'paused'].includes(selectedCampaign.status) && (
                    <Button size="sm" variant="destructive" onClick={handleCancelCampaign}>
                      <Square className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Progress */}
              <div className="space-y-2">
                <Progress 
                  value={((selectedCampaign.sent_count + selectedCampaign.failed_count + selectedCampaign.skipped_count) / selectedCampaign.total_recipients) * 100} 
                />
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div>
                    <p className="text-muted-foreground">Queued</p>
                    <p className="font-medium">{selectedCampaign.queued_count}</p>
                  </div>
                  <div>
                    <p className="text-green-500">Sent</p>
                    <p className="font-medium">{selectedCampaign.sent_count}</p>
                  </div>
                  <div>
                    <p className="text-destructive">Failed</p>
                    <p className="font-medium">{selectedCampaign.failed_count}</p>
                  </div>
                  <div>
                    <p className="text-yellow-500">Skipped</p>
                    <p className="font-medium">{selectedCampaign.skipped_count}</p>
                  </div>
                </div>
              </div>

              {/* Recipients Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Recipients</Label>
                  <Tabs value={recipientFilter} onValueChange={setRecipientFilter} className="h-7">
                    <TabsList className="h-7">
                      <TabsTrigger value="all" className="text-xs h-6 px-2">All</TabsTrigger>
                      <TabsTrigger value="sent" className="text-xs h-6 px-2">Sent</TabsTrigger>
                      <TabsTrigger value="failed" className="text-xs h-6 px-2">Failed</TabsTrigger>
                      <TabsTrigger value="queued" className="text-xs h-6 px-2">Queued</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <ScrollArea className="h-48 border rounded">
                  <div className="divide-y divide-border/50">
                    {loadingRecipients ? (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : filteredRecipients.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center p-4">
                        No recipients
                      </p>
                    ) : (
                      filteredRecipients.map((r) => (
                        <div key={r.id} className="p-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-mono">{r.phone_e164}</span>
                            {getStatusBadge(r.status)}
                          </div>
                          {r.first_name && (
                            <span className="text-muted-foreground">{r.first_name}</span>
                          )}
                          {r.error && (
                            <p className="text-destructive mt-1">{r.error}</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
