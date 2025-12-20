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
  Eye,
  Zap,
  Activity
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { parseContactsFromText, parseContactsFromCSV, normalizePhoneToE164, type ParsedContact } from "@/lib/phoneParser";

interface WorkerStatus {
  lastRunAt: string | null;
  runsIn15Min: number;
  isStalled: boolean;
}

// SMS character limits
const GSM7_SINGLE_LIMIT = 160;
const GSM7_MULTI_LIMIT = 153;
const UNICODE_SINGLE_LIMIT = 70;
const UNICODE_MULTI_LIMIT = 67;
const MAX_MESSAGE_LENGTH = 2000;

// GSM-7 character set (basic + extended)
// Basic set: Standard ASCII letters, digits, and specific symbols
// Extended set: Characters that use escape sequence (count as 2 chars)
const GSM7_BASIC_CHARS = new Set([
  '@', '£', '$', '¥', 'è', 'é', 'ù', 'ì', 'ò', 'Ç', '\n', 'Ø', 'ø', '\r', 'Å', 'å',
  'Δ', '_', 'Φ', 'Γ', 'Λ', 'Ω', 'Π', 'Ψ', 'Σ', 'Θ', 'Ξ', ' ', 'Æ', 'æ', 'ß', 'É',
  '!', '"', '#', '¤', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ';', '<', '=', '>', '?',
  '¡', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
  'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Ä', 'Ö', 'Ñ', 'Ü', '§',
  '¿', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
  'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'ä', 'ö', 'ñ', 'ü', 'à'
]);

// Extended GSM-7 chars (each counts as 2 characters due to escape sequence)
const GSM7_EXTENDED_CHARS = new Set(['^', '{', '}', '\\', '[', ']', '~', '|', '€']);

// Check if a string is GSM-7 compatible and calculate effective length
const analyzeGsm7 = (text: string): { isGsm7: boolean; effectiveLength: number } => {
  let effectiveLength = 0;
  for (const char of text) {
    if (GSM7_BASIC_CHARS.has(char)) {
      effectiveLength += 1;
    } else if (GSM7_EXTENDED_CHARS.has(char)) {
      effectiveLength += 2; // Extended chars count as 2
    } else {
      // Not GSM-7 compatible - switch to Unicode
      return { isGsm7: false, effectiveLength: text.length };
    }
  }
  return { isGsm7: true, effectiveLength };
};

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
  next_send_at: string | null;
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
  const [template, setTemplate] = useState("Hey {first_name}, this is Cash Ridez Connect LLC. We responded on Indeed as well, please reply CASH for the next steps.");
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
  
  // Worker status state
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>({
    lastRunAt: null,
    runsIn15Min: 0,
    isStalled: false
  });
  const [runningWorker, setRunningWorker] = useState(false);

  // Calculate message info with accurate GSM-7 detection
  const calculateMessageInfo = (body: string, withOptOut: boolean) => {
    const fullMessage = withOptOut ? body + OPT_OUT_TEXT : body;
    const charCount = fullMessage.length;
    
    // Analyze for GSM-7 compatibility
    const analysis = analyzeGsm7(fullMessage);
    const { isGsm7, effectiveLength } = analysis;
    
    const singleLimit = isGsm7 ? GSM7_SINGLE_LIMIT : UNICODE_SINGLE_LIMIT;
    const multiLimit = isGsm7 ? GSM7_MULTI_LIMIT : UNICODE_MULTI_LIMIT;
    
    let segments = 1;
    if (effectiveLength > singleLimit) {
      segments = Math.ceil(effectiveLength / multiLimit);
    }
    
    return { 
      charCount, 
      effectiveLength, 
      segments, 
      isGsm7,
      encoding: isGsm7 ? 'GSM-7' : 'Unicode'
    };
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

  // Load worker status
  const fetchWorkerStatus = useCallback(async () => {
    try {
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      
      // Get last run
      const { data: lastRun } = await supabase
        .from("admin_sms_worker_runs")
        .select("ran_at")
        .order("ran_at", { ascending: false })
        .limit(1)
        .single();
      
      // Count runs in last 15 minutes
      const { count: runsCount } = await supabase
        .from("admin_sms_worker_runs")
        .select("*", { count: "exact", head: true })
        .gte("ran_at", fifteenMinAgo);
      
      // Check if stalled: last run > 2 min ago AND there are queued recipients
      const { count: queuedRecipients } = await supabase
        .from("admin_sms_campaign_recipients")
        .select("*", { count: "exact", head: true })
        .eq("status", "queued");
      
      const lastRunAt = lastRun?.ran_at || null;
      const isStalled = lastRunAt 
        ? new Date(lastRunAt) < new Date(twoMinAgo) && (queuedRecipients || 0) > 0
        : (queuedRecipients || 0) > 0;
      
      setWorkerStatus({
        lastRunAt,
        runsIn15Min: runsCount || 0,
        isStalled
      });
    } catch (err) {
      console.error("Failed to fetch worker status:", err);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
    fetchWorkerStatus();
    
    // Poll worker status every 10 seconds
    const interval = setInterval(fetchWorkerStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchCampaigns, fetchWorkerStatus]);

  // Run worker now
  const handleRunWorkerNow = async () => {
    setRunningWorker(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-bulk-sms-runner', {
        body: {}
      });
      
      if (error) throw error;
      
      toast({ 
        title: "Worker Triggered", 
        description: `Processed ${data?.worker_result?.processed || 0} recipients`
      });
      
      // Refresh status
      await fetchWorkerStatus();
      await fetchCampaigns();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setRunningWorker(false);
    }
  };

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

  // Pause/Resume/Cancel campaign using edge function
  const handlePauseCampaign = async () => {
    if (!selectedCampaign) return;
    try {
      const { error } = await supabase.functions.invoke('admin-autotext-control', {
        body: { campaign_id: selectedCampaign.id, action: 'pause' }
      });
      if (error) throw error;
      toast({ title: "Campaign Paused", description: "Campaign will pause after current message." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleResumeCampaign = async () => {
    if (!selectedCampaign) return;
    try {
      const { error } = await supabase.functions.invoke('admin-autotext-control', {
        body: { campaign_id: selectedCampaign.id, action: 'resume' }
      });
      if (error) throw error;
      toast({ title: "Campaign Resumed", description: "Campaign will continue sending." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleCancelCampaign = async () => {
    if (!selectedCampaign) return;
    if (!confirm("Are you sure you want to cancel this campaign? Remaining recipients will be skipped.")) return;
    try {
      const { error } = await supabase.functions.invoke('admin-autotext-control', {
        body: { campaign_id: selectedCampaign.id, action: 'cancel' }
      });
      if (error) throw error;
      toast({ title: "Campaign Cancelled", description: "Remaining recipients were skipped." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
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

  // Calculate ETA based on 61-second throttle
  const calculateEta = (campaign: Campaign) => {
    const remaining = campaign.queued_count;
    const secondsPerMessage = 61;
    const totalSeconds = remaining * secondsPerMessage;
    const minutes = Math.ceil(totalSeconds / 60);
    if (minutes < 60) return `~${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `~${hours}h ${mins}m`;
  };

  // Calculate next send countdown
  const getNextSendCountdown = (campaign: Campaign) => {
    if (!campaign.next_send_at || campaign.status !== 'running') return null;
    const nextSend = new Date(campaign.next_send_at);
    const now = new Date();
    const diffMs = nextSend.getTime() - now.getTime();
    if (diffMs <= 0) return 'Sending...';
    const diffSec = Math.ceil(diffMs / 1000);
    return `Next in ${diffSec}s`;
  };

  return (
    <div className="space-y-6">
      {/* Worker Status Panel */}
      <Card className={cn(
        "bg-card/80 backdrop-blur-sm border-border/50",
        workerStatus.isStalled && "border-yellow-500/50"
      )}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Worker Status
            {workerStatus.isStalled && (
              <Badge variant="outline" className="text-yellow-600 border-yellow-500/50 bg-yellow-500/10 ml-2">
                <AlertCircle className="h-3 w-3 mr-1" />
                Stalled
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Last run: </span>
              <span className="font-medium">
                {workerStatus.lastRunAt 
                  ? formatDistanceToNow(new Date(workerStatus.lastRunAt), { addSuffix: true })
                  : 'Never'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Runs (15m): </span>
              <span className="font-medium">{workerStatus.runsIn15Min}</span>
            </div>
            {selectedCampaign?.next_send_at && selectedCampaign.status === 'running' && (
              <div>
                <span className="text-muted-foreground">Next send: </span>
                <span className="font-medium">
                  {new Date(selectedCampaign.next_send_at) <= new Date() 
                    ? 'Now' 
                    : formatDistanceToNow(new Date(selectedCampaign.next_send_at), { addSuffix: true })}
                </span>
              </div>
            )}
            <div className="ml-auto">
              <Button
                size="sm"
                variant={workerStatus.isStalled ? "default" : "outline"}
                onClick={handleRunWorkerNow}
                disabled={runningWorker}
              >
                {runningWorker ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Zap className="h-4 w-4 mr-1" />
                )}
                Run Now
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
              onChange={(e) => {
                if (e.target.value.length <= MAX_MESSAGE_LENGTH) {
                  setTemplate(e.target.value);
                }
              }}
              placeholder="Hi {first_name}, ..."
              rows={5}
              className="min-h-[120px]"
            />
            <p className="text-xs text-muted-foreground">
              Use {"{first_name}"} for personalization
            </p>
            
            {/* Message stats */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="text-muted-foreground">
                Characters: <span className="font-medium text-foreground">{templateInfo.charCount}</span>
                {templateInfo.effectiveLength !== templateInfo.charCount && (
                  <span className="text-muted-foreground"> ({templateInfo.effectiveLength} GSM units)</span>
                )}
              </span>
              <span className="text-muted-foreground">
                Encoding: <span className={cn(
                  "font-medium",
                  templateInfo.isGsm7 ? "text-foreground" : "text-yellow-500"
                )}>{templateInfo.encoding}</span>
              </span>
              <span className="text-muted-foreground">
                Segments: <span className={cn(
                  "font-medium",
                  templateInfo.segments > 3 ? "text-yellow-500" : "text-foreground"
                )}>{templateInfo.segments}</span>
              </span>
            </div>

            {/* Warnings */}
            <div className="flex flex-wrap gap-2">
              {!templateInfo.isGsm7 && (
                <Badge variant="outline" className="text-yellow-600 border-yellow-500/50 bg-yellow-500/10">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Unicode mode — fewer chars per segment (67 vs 153)
                </Badge>
              )}
              {templateInfo.segments > 3 && (
                <Badge variant="outline" className="text-yellow-600 border-yellow-500/50 bg-yellow-500/10">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {templateInfo.segments} segments — may cost more
                </Badge>
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
                        {getNextSendCountdown(selectedCampaign) || calculateEta(selectedCampaign)}
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
    </div>
  );
}
