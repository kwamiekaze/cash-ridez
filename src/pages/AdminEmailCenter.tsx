import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Loader2, Send, Mail, User, History, ArrowLeft, AlertCircle, Plus, Search, Activity, RefreshCw, Upload, CheckCircle, Clock, XCircle, Pause, Play, Square } from "lucide-react";
import { MapBackground } from "@/components/MapBackground";
import AppHeader from "@/components/AppHeader";
import AdminRoute from "@/components/AdminRoute";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";

interface UserWithEmail {
  id: string;
  full_name: string | null;
  display_name: string | null;
  email: string;
}

interface EmailLog {
  id: string;
  created_at: string;
  recipient_email: string | null;
  subject: string | null;
  body_preview: string | null;
  status: string;
  error_message: string | null;
  email_type: string;
  resend_message_id: string | null;
}

interface Campaign {
  id: string;
  created_at: string;
  name: string | null;
  sender: string;
  subject_template: string;
  body_template: string;
  status: string;
  total_recipients: number;
  queued_count: number;
  sent_count: number;
  failed_count: number;
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
}

interface CampaignRecipient {
  id: string;
  first_name: string | null;
  email: string;
  subject_rendered: string;
  body_rendered: string;
  status: string;
  error: string | null;
  sent_at: string | null;
}

interface ParsedRecipient {
  rawLine: string;
  firstName: string | null;
  email: string | null;
  valid: boolean;
  error?: string;
  subjectRendered?: string;
  bodyRendered?: string;
}

const AdminEmailCenter = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Tab state
  const [activeTab, setActiveTab] = useState("compose");
  
  // Compose form state
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  
  // User picker state
  const [users, setUsers] = useState<UserWithEmail[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // Logs state
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  
  // AutoEmail state
  const [campaignName, setCampaignName] = useState("");
  const [subjectTemplate, setSubjectTemplate] = useState("Welcome to CashRidez, {first_name}!");
  const [bodyTemplate, setBodyTemplate] = useState("Hey {first_name},\n\nWelcome to CashRidez! We're excited to have you.\n\nBest,\nThe CashRidez Team");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedRecipients, setParsedRecipients] = useState<ParsedRecipient[]>([]);
  const [parsing, setParsing] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Campaigns state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [runningWorker, setRunningWorker] = useState(false);

  // Load users with emails
  useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true);
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, display_name, email")
        .not("email", "is", null)
        .order("full_name", { ascending: true });
      
      setUsers((data || []) as UserWithEmail[]);
      setLoadingUsers(false);
    };
    fetchUsers();
  }, []);

  // Load email logs
  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    const { data } = await supabase
      .from("email_logs")
      .select("id, created_at, recipient_email, subject, body_preview, status, error_message, email_type, resend_message_id")
      .order("created_at", { ascending: false })
      .limit(100);
    
    setLogs((data || []) as EmailLog[]);
    setLoadingLogs(false);
  }, []);

  useEffect(() => {
    if (activeTab === "logs") {
      fetchLogs();
    }
  }, [activeTab, fetchLogs]);

  // Load campaigns
  const fetchCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    const { data, error } = await supabase
      .from("admin_email_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    
    if (!error) {
      setCampaigns((data || []) as Campaign[]);
    }
    setLoadingCampaigns(false);
  }, []);

  useEffect(() => {
    if (activeTab === "autoemail") {
      fetchCampaigns();
    }
  }, [activeTab, fetchCampaigns]);

  // Load recipients for selected campaign
  const fetchRecipients = useCallback(async (campaignId: string) => {
    setLoadingRecipients(true);
    const { data } = await supabase
      .from("admin_email_campaign_recipients")
      .select("id, first_name, email, subject_rendered, body_rendered, status, error, sent_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .limit(500);
    
    setRecipients((data || []) as CampaignRecipient[]);
    setLoadingRecipients(false);
  }, []);

  useEffect(() => {
    if (selectedCampaign) {
      fetchRecipients(selectedCampaign.id);
    }
  }, [selectedCampaign, fetchRecipients]);

  // Realtime subscriptions for campaigns
  useEffect(() => {
    const channel = supabase
      .channel(`email-campaign-changes-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_email_campaigns' },
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
      .subscribe((status, err) => {
        if (err) console.warn('[realtime] subscription error:', err);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedCampaign]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    if (!userSearchQuery.trim()) return users.slice(0, 50);
    const query = userSearchQuery.toLowerCase();
    return users.filter(u => 
      u.full_name?.toLowerCase().includes(query) ||
      u.display_name?.toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query)
    ).slice(0, 50);
  }, [users, userSearchQuery]);

  // Parse email from text
  const parseEmail = (text: string): { email: string | null; firstName: string | null } => {
    const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (!emailMatch) return { email: null, firstName: null };
    
    const email = emailMatch[0].toLowerCase();
    // Try to extract name before email
    const beforeEmail = text.slice(0, text.indexOf(emailMatch[0])).trim();
    const firstName = beforeEmail.split(/\s+/)[0] || null;
    
    return { email, firstName };
  };

  // Parse uploaded file
  const parseFile = async (file: File) => {
    setParsing(true);
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    
    const parsed: ParsedRecipient[] = lines.map(line => {
      const { email, firstName } = parseEmail(line);
      if (!email) {
        return { rawLine: line, firstName: null, email: null, valid: false, error: 'No valid email found' };
      }
      return {
        rawLine: line,
        firstName,
        email,
        valid: true,
        subjectRendered: renderTemplate(subjectTemplate, firstName),
        bodyRendered: renderTemplate(bodyTemplate, firstName)
      };
    });
    
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

  // Render template with personalization
  const renderTemplate = (tmpl: string, firstName: string | null): string => {
    return tmpl.replace(/{first_name}/g, firstName || "there");
  };

  // Re-render messages when template changes
  useEffect(() => {
    if (parsedRecipients.length > 0) {
      setParsedRecipients(prev => 
        prev.map(r => ({
          ...r,
          subjectRendered: r.email ? renderTemplate(subjectTemplate, r.firstName) : undefined,
          bodyRendered: r.email ? renderTemplate(bodyTemplate, r.firstName) : undefined
        }))
      );
    }
  }, [subjectTemplate, bodyTemplate]);

  const validCount = parsedRecipients.filter(r => r.valid).length;
  const invalidCount = parsedRecipients.filter(r => !r.valid).length;

  // Send single email
  const handleSendEmail = async () => {
    if (!recipient.trim() || !subject.trim() || !messageBody.trim()) {
      toast({ title: "Missing fields", description: "Please fill in all fields", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-send-email', {
        body: { to: recipient, subject, body: messageBody }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error || 'Failed to send email');

      toast({ title: "Email sent", description: `Email sent to ${recipient}` });
      setRecipient("");
      setSubject("");
      setMessageBody("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // Create campaign
  const handleCreateCampaign = async () => {
    if (!consentConfirmed) {
      toast({ title: "Consent Required", description: "Please confirm recipients have consent", variant: "destructive" });
      return;
    }

    if (validCount === 0) {
      toast({ title: "No Recipients", description: "Upload a file with valid emails", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create campaign
      const { data: campaign, error: campaignError } = await supabase
        .from("admin_email_campaigns")
        .insert({
          created_by: user.id,
          name: campaignName || null,
          sender: "connect@cashridez.com",
          subject_template: subjectTemplate,
          body_template: bodyTemplate,
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
        email: r.email!,
        subject_rendered: r.subjectRendered!,
        body_rendered: r.bodyRendered!,
        status: "queued"
      }));

      const { error: recipError } = await supabase
        .from("admin_email_campaign_recipients")
        .insert(recipientRows);

      if (recipError) throw recipError;

      toast({ title: "Campaign Started", description: `Sending to ${validCount} recipients` });

      // Trigger worker
      await supabase.functions.invoke('admin-bulk-email-runner', {
        body: { campaign_id: campaign.id }
      });

      // Reset form
      setCampaignName("");
      setUploadedFile(null);
      setParsedRecipients([]);
      setConsentConfirmed(false);
      setSelectedCampaign(campaign as Campaign);
      fetchCampaigns();

    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // Campaign control actions
  const handlePauseCampaign = async () => {
    if (!selectedCampaign) return;
    try {
      const { error } = await supabase.functions.invoke('admin-email-control', {
        body: { campaign_id: selectedCampaign.id, action: 'pause' }
      });
      if (error) throw error;
      toast({ title: "Campaign Paused" });
      fetchCampaigns();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleResumeCampaign = async () => {
    if (!selectedCampaign) return;
    try {
      const { error } = await supabase.functions.invoke('admin-email-control', {
        body: { campaign_id: selectedCampaign.id, action: 'resume' }
      });
      if (error) throw error;
      toast({ title: "Campaign Resumed" });
      fetchCampaigns();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleCancelCampaign = async () => {
    if (!selectedCampaign) return;
    try {
      const { error } = await supabase.functions.invoke('admin-email-control', {
        body: { campaign_id: selectedCampaign.id, action: 'cancel' }
      });
      if (error) throw error;
      toast({ title: "Campaign Cancelled" });
      fetchCampaigns();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleRunWorkerNow = async () => {
    setRunningWorker(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-bulk-email-runner', {
        body: {}
      });
      if (error) throw error;
      toast({ title: "Worker Triggered", description: `Processed ${data?.worker_result?.processed || 0} recipients` });
      fetchCampaigns();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setRunningWorker(false);
    }
  };

  // Status badge helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
      case "success":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" /> {status}</Badge>;
      case "failed":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="w-3 h-3 mr-1" /> {status}</Badge>;
      case "queued":
      case "pending":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" /> {status}</Badge>;
      case "running":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><Activity className="w-3 h-3 mr-1 animate-pulse" /> {status}</Badge>;
      case "paused":
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30"><Pause className="w-3 h-3 mr-1" /> {status}</Badge>;
      case "completed":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" /> {status}</Badge>;
      case "cancelled":
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30"><Square className="w-3 h-3 mr-1" /> {status}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <AdminRoute>
      <div className="min-h-screen bg-background relative">
        <MapBackground />
        <AppHeader showStatus={false} />

        <div className="container mx-auto px-2 sm:px-4 py-4 md:py-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 md:mb-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/admin')}
                className="text-white hover:bg-white/10"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">
                  Email Center
                </h1>
                <p className="text-gray-300 text-sm">
                  Send emails to users • Sender: connect@cashridez.com
                </p>
              </div>
            </div>
          </motion.div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-3 bg-card/50 backdrop-blur-sm border border-border/50">
              <TabsTrigger value="compose" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-white">
                <Send className="h-4 w-4 mr-2" />
                Compose
              </TabsTrigger>
              <TabsTrigger value="autoemail" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-white">
                <Upload className="h-4 w-4 mr-2" />
                AutoEmail
              </TabsTrigger>
              <TabsTrigger value="logs" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-white">
                <History className="h-4 w-4 mr-2" />
                Email Logs
              </TabsTrigger>
            </TabsList>

            {/* Compose Tab */}
            <TabsContent value="compose" className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                {/* Compose Form */}
                <Card className="bg-card/80 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Compose Email
                    </CardTitle>
                    <CardDescription>Send a single email to a user</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Recipient Email</Label>
                      <Input
                        type="email"
                        placeholder="user@example.com"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Subject</Label>
                      <Input
                        placeholder="Email subject..."
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Email Body</Label>
                      <Textarea
                        placeholder="Write your email message..."
                        value={messageBody}
                        onChange={(e) => setMessageBody(e.target.value)}
                        rows={8}
                        className="font-mono text-sm"
                      />
                    </div>

                    <Button
                      onClick={handleSendEmail}
                      disabled={sending || !recipient || !subject || !messageBody}
                      className="w-full"
                    >
                      {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                      Send Email
                    </Button>
                  </CardContent>
                </Card>

                {/* User Picker */}
                <Card className="bg-card/80 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Select User
                    </CardTitle>
                    <CardDescription>Click a user to fill their email</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search users..."
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>

                    <ScrollArea className="h-[400px] border rounded-md">
                      {loadingUsers ? (
                        <div className="flex items-center justify-center h-20">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : filteredUsers.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">No users found</div>
                      ) : (
                        <div className="divide-y divide-border">
                          {filteredUsers.map((u) => (
                            <button
                              key={u.id}
                              onClick={() => setRecipient(u.email)}
                              className={cn(
                                "w-full text-left px-3 py-2 hover:bg-primary/10 transition-colors",
                                recipient === u.email && "bg-primary/20"
                              )}
                            >
                              <div className="font-medium text-sm truncate text-white">
                                {u.full_name || u.display_name || 'Unknown'}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {u.email}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* AutoEmail Tab */}
            <TabsContent value="autoemail" className="space-y-4">
              <div className="grid lg:grid-cols-2 gap-4">
                {/* Create Campaign */}
                <Card className="bg-card/80 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Create Email Campaign
                    </CardTitle>
                    <CardDescription>Upload a list to send batch emails</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Campaign Name (optional)</Label>
                      <Input
                        placeholder="e.g., Welcome Campaign Jan 2025"
                        value={campaignName}
                        onChange={(e) => setCampaignName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Subject Template</Label>
                      <Input
                        placeholder="Subject with {first_name} placeholder"
                        value={subjectTemplate}
                        onChange={(e) => setSubjectTemplate(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Use {"{first_name}"} for personalization</p>
                    </div>

                    <div className="space-y-2">
                      <Label>Body Template</Label>
                      <Textarea
                        placeholder="Email body with {first_name} placeholder..."
                        value={bodyTemplate}
                        onChange={(e) => setBodyTemplate(e.target.value)}
                        rows={6}
                        className="font-mono text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Upload Recipients (.txt or .csv)</Label>
                      <Input
                        type="file"
                        accept=".txt,.csv"
                        onChange={handleFileChange}
                        className="cursor-pointer"
                      />
                      <p className="text-xs text-muted-foreground">
                        Format: "FirstName email@example.com" per line
                      </p>
                    </div>

                    {parsing && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Parsing file...
                      </div>
                    )}

                    {parsedRecipients.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-green-400">✓ Valid: {validCount}</span>
                          {invalidCount > 0 && (
                            <span className="text-red-400">✗ Invalid: {invalidCount}</span>
                          )}
                        </div>
                        
                        <ScrollArea className="h-[150px] border rounded-md p-2">
                          {parsedRecipients.slice(0, 20).map((r, i) => (
                            <div key={i} className={cn(
                              "text-xs py-1",
                              r.valid ? "text-green-400" : "text-red-400"
                            )}>
                              {r.valid ? `✓ ${r.firstName || 'No name'} → ${r.email}` : `✗ ${r.rawLine}: ${r.error}`}
                            </div>
                          ))}
                          {parsedRecipients.length > 20 && (
                            <div className="text-xs text-muted-foreground mt-2">
                              ... and {parsedRecipients.length - 20} more
                            </div>
                          )}
                        </ScrollArea>
                      </div>
                    )}

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="consent"
                        checked={consentConfirmed}
                        onCheckedChange={(checked) => setConsentConfirmed(checked === true)}
                      />
                      <label htmlFor="consent" className="text-sm text-muted-foreground cursor-pointer">
                        I confirm recipients have consented to receive emails
                      </label>
                    </div>

                    <Button
                      onClick={handleCreateCampaign}
                      disabled={creating || !consentConfirmed || validCount === 0}
                      className="w-full"
                    >
                      {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                      Start Campaign ({validCount} emails)
                    </Button>
                  </CardContent>
                </Card>

                {/* Campaigns List */}
                <Card className="bg-card/80 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Campaigns
                      </CardTitle>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleRunWorkerNow} disabled={runningWorker}>
                          {runningWorker ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        </Button>
                        <Button variant="outline" size="sm" onClick={fetchCampaigns} disabled={loadingCampaigns}>
                          <RefreshCw className={cn("h-4 w-4", loadingCampaigns && "animate-spin")} />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[500px]">
                      {campaigns.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">No campaigns yet</div>
                      ) : (
                        <div className="space-y-2">
                          {campaigns.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => setSelectedCampaign(c)}
                              className={cn(
                                "w-full text-left p-3 rounded-lg border transition-colors",
                                selectedCampaign?.id === c.id 
                                  ? "bg-primary/20 border-primary" 
                                  : "bg-background/50 border-border hover:bg-primary/10"
                              )}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-white truncate">
                                  {c.name || 'Unnamed Campaign'}
                                </span>
                                {getStatusBadge(c.status)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(c.created_at), "MMM d, h:mm a")}
                              </div>
                              <div className="flex items-center gap-2 mt-2 text-xs">
                                <span className="text-green-400">{c.sent_count || 0} sent</span>
                                <span className="text-yellow-400">{c.queued_count || 0} queued</span>
                                {(c.failed_count || 0) > 0 && (
                                  <span className="text-red-400">{c.failed_count} failed</span>
                                )}
                              </div>
                              {c.status === 'running' && c.total_recipients > 0 && (
                                <Progress 
                                  value={((c.sent_count || 0) / c.total_recipients) * 100} 
                                  className="h-1 mt-2"
                                />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </ScrollArea>

                    {/* Campaign Controls */}
                    {selectedCampaign && (
                      <div className="flex gap-2 mt-4 pt-4 border-t">
                        {selectedCampaign.status === 'running' && (
                          <Button variant="outline" size="sm" onClick={handlePauseCampaign}>
                            <Pause className="h-4 w-4 mr-1" /> Pause
                          </Button>
                        )}
                        {selectedCampaign.status === 'paused' && (
                          <Button variant="outline" size="sm" onClick={handleResumeCampaign}>
                            <Play className="h-4 w-4 mr-1" /> Resume
                          </Button>
                        )}
                        {['running', 'paused'].includes(selectedCampaign.status) && (
                          <Button variant="destructive" size="sm" onClick={handleCancelCampaign}>
                            <Square className="h-4 w-4 mr-1" /> Cancel
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Email Logs Tab */}
            <TabsContent value="logs" className="space-y-4">
              <Card className="bg-card/80 backdrop-blur-sm border-border/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white flex items-center gap-2">
                      <History className="h-5 w-5" />
                      Email Logs
                    </CardTitle>
                    <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loadingLogs}>
                      <RefreshCw className={cn("h-4 w-4", loadingLogs && "animate-spin")} />
                    </Button>
                  </div>
                  <CardDescription>Recent email sends (last 100)</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[600px]">
                    {loadingLogs ? (
                      <div className="flex items-center justify-center h-20">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : logs.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">No email logs yet</div>
                    ) : (
                      <div className="space-y-2">
                        {logs.map((log) => (
                          <div key={log.id} className="p-3 rounded-lg bg-background/50 border border-border">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-white truncate">
                                  {log.recipient_email || 'Unknown'}
                                </div>
                                <div className="text-sm text-muted-foreground truncate">
                                  {log.subject || 'No subject'}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {format(new Date(log.created_at), "MMM d, h:mm:ss a")} • {log.email_type}
                                </div>
                              </div>
                              {getStatusBadge(log.status)}
                            </div>
                            {log.error_message && (
                              <div className="text-xs text-red-400 mt-2 flex items-start gap-1">
                                <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                <span className="truncate">{log.error_message}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AdminRoute>
  );
};

export default AdminEmailCenter;
