import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { 
  Upload, 
  Send, 
  FileText, 
  CheckCircle, 
  AlertCircle,
  Clock,
  Loader2,
  Trash2,
  RefreshCw,
  Timer,
  XCircle
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { parseContactsFromText, parseContactsFromCSV, type ParsedContact } from "@/lib/phoneParser";

interface Draft {
  id: string;
  created_at: string;
  recipient_name: string | null;
  recipient_phone: string;
  message_body_final: string;
  status: 'draft' | 'sending' | 'sent' | 'failed' | 'skipped';
  sent_at: string | null;
  last_attempt_at: string | null;
  error_message: string | null;
  conversation_id: string | null;
}

interface SendLock {
  locked_until: string | null;
  last_sent_at: string | null;
}

const OPT_OUT_TEXT = "\n\nReply STOP to opt out.";
const COOLDOWN_SECONDS = 90;

export function DraftsTab() {
  const { user } = useAuth();
  
  // Form state
  const [template, setTemplate] = useState("Hey {first_name}, this is Cash Ridez Connect LLC. We responded on Indeed as well, please reply CASH for the next steps.");
  const [includeOptOut, setIncludeOptOut] = useState(true);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  
  // File upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [parsing, setParsing] = useState(false);
  
  // Drafts state
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Send lock state
  const [sendLock, setSendLock] = useState<SendLock | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [sendingDraftId, setSendingDraftId] = useState<string | null>(null);
  
  // Filter
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Render message with template
  const renderMessage = (tmpl: string, firstName: string | null, withOptOut: boolean): string => {
    let msg = tmpl.replace(/{first_name}/g, firstName || "there");
    if (withOptOut) msg += OPT_OUT_TEXT;
    return msg;
  };

  // Parse uploaded file
  const parseFile = async (file: File) => {
    setParsing(true);
    const text = await file.text();
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    
    const contacts = isCsv 
      ? parseContactsFromCSV(text) 
      : parseContactsFromText(text);
    
    setParsedContacts(contacts);
    setParsing(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      parseFile(file);
    }
  };

  const validContacts = useMemo(() => 
    parsedContacts.filter(c => c.valid), [parsedContacts]);

  const invalidContacts = useMemo(() => 
    parsedContacts.filter(c => !c.valid), [parsedContacts]);

  // Fetch drafts
  const fetchDrafts = useCallback(async () => {
    setLoadingDrafts(true);
    const { data, error } = await supabase
      .from('admin_sms_drafts')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setDrafts(data as Draft[]);
    }
    setLoadingDrafts(false);
  }, []);

  // Fetch send lock
  const fetchSendLock = useCallback(async () => {
    const { data } = await supabase
      .from('admin_sms_send_lock')
      .select('locked_until, last_sent_at')
      .eq('id', 'global')
      .single();
    
    if (data) {
      setSendLock(data);
      updateCooldown(data.locked_until);
    }
  }, []);

  const updateCooldown = (lockedUntil: string | null) => {
    if (!lockedUntil) {
      setCooldownRemaining(0);
      return;
    }
    const until = new Date(lockedUntil);
    const now = new Date();
    const diff = Math.max(0, Math.ceil((until.getTime() - now.getTime()) / 1000));
    setCooldownRemaining(diff);
  };

  // Cooldown timer
  useEffect(() => {
    const interval = setInterval(() => {
      if (cooldownRemaining > 0) {
        setCooldownRemaining(prev => Math.max(0, prev - 1));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  // Initial load and realtime subscription
  useEffect(() => {
    fetchDrafts();
    fetchSendLock();

    // Subscribe to drafts changes
    const draftsChannel = supabase
      .channel('drafts-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_sms_drafts' }, () => {
        fetchDrafts();
      })
      .subscribe();

    // Subscribe to send lock changes
    const lockChannel = supabase
      .channel('lock-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_sms_send_lock' }, (payload) => {
        if (payload.new) {
          const newLock = payload.new as SendLock;
          setSendLock(newLock);
          updateCooldown(newLock.locked_until);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(draftsChannel);
      supabase.removeChannel(lockChannel);
    };
  }, [fetchDrafts, fetchSendLock]);

  // Create drafts from parsed contacts
  const handleGenerateDrafts = async () => {
    if (!user || validContacts.length === 0) return;
    
    if (!consentConfirmed) {
      toast({
        title: "Consent required",
        description: "Please confirm recipients have given consent.",
        variant: "destructive"
      });
      return;
    }
    
    setCreating(true);
    
    const draftsToInsert = validContacts.map(contact => ({
      created_by_admin_id: user.id,
      recipient_name: contact.firstName,
      recipient_phone: contact.phoneE164!,
      message_body_final: renderMessage(template, contact.firstName, includeOptOut),
      status: 'draft',
      source: 'upload'
    }));
    
    const { error } = await supabase
      .from('admin_sms_drafts')
      .insert(draftsToInsert);
    
    if (error) {
      toast({
        title: "Error creating drafts",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Drafts created",
        description: `${validContacts.length} drafts ready to send.`
      });
      // Reset form
      setUploadedFile(null);
      setParsedContacts([]);
      setConsentConfirmed(false);
      fetchDrafts();
    }
    
    setCreating(false);
  };

  // Send a single draft
  const handleSendDraft = async (draftId: string) => {
    if (cooldownRemaining > 0) {
      toast({
        title: "Cooldown active",
        description: `Wait ${cooldownRemaining} seconds before sending.`,
        variant: "destructive"
      });
      return;
    }
    
    setSendingDraftId(draftId);
    
    try {
      const { data, error } = await supabase.functions.invoke('admin-send-draft', {
        body: { draft_id: draftId }
      });
      
      if (error || !data?.ok) {
        const errMsg = data?.error || error?.message || 'Failed to send';
        toast({
          title: "Send failed",
          description: errMsg,
          variant: "destructive"
        });
        
        if (data?.cooldown_until) {
          updateCooldown(data.cooldown_until);
        }
      } else {
        toast({
          title: "Sent!",
          description: `Message sent successfully.`
        });
        
        if (data.cooldown_until) {
          updateCooldown(data.cooldown_until);
        }
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive"
      });
    }
    
    setSendingDraftId(null);
    fetchDrafts();
  };

  // Delete a draft
  const handleDeleteDraft = async (draftId: string) => {
    const { error } = await supabase
      .from('admin_sms_drafts')
      .delete()
      .eq('id', draftId);
    
    if (!error) {
      toast({ title: "Draft deleted" });
      fetchDrafts();
    }
  };

  // Delete all drafts
  const handleClearDrafts = async () => {
    if (!confirm('Delete all drafts? This cannot be undone.')) return;
    
    const { error } = await supabase
      .from('admin_sms_drafts')
      .delete()
      .eq('status', 'draft');
    
    if (!error) {
      toast({ title: "Drafts cleared" });
      fetchDrafts();
    }
  };

  // Filtered drafts
  const filteredDrafts = useMemo(() => {
    if (statusFilter === 'all') return drafts;
    return drafts.filter(d => d.status === statusFilter);
  }, [drafts, statusFilter]);

  const draftStats = useMemo(() => {
    return {
      draft: drafts.filter(d => d.status === 'draft').length,
      sent: drafts.filter(d => d.status === 'sent').length,
      failed: drafts.filter(d => d.status === 'failed').length,
      sending: drafts.filter(d => d.status === 'sending').length,
    };
  }, [drafts]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Draft</Badge>;
      case 'sending':
        return <Badge className="gap-1 bg-blue-500"><Loader2 className="h-3 w-3 animate-spin" /> Sending</Badge>;
      case 'sent':
        return <Badge className="gap-1 bg-green-600"><CheckCircle className="h-3 w-3" /> Sent</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Failed</Badge>;
      case 'skipped':
        return <Badge variant="secondary" className="gap-1">Skipped</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Cooldown Banner */}
      {cooldownRemaining > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <Timer className="h-5 w-5 text-amber-500 animate-pulse" />
            <div className="flex-1">
              <p className="font-medium text-amber-700 dark:text-amber-400">
                Cooldown Active
              </p>
              <p className="text-sm text-muted-foreground">
                Next send available in <span className="font-mono font-bold">{cooldownRemaining}s</span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        <Card className="p-3 md:p-4">
          <div className="text-2xl font-bold">{draftStats.draft}</div>
          <div className="text-xs text-muted-foreground">Pending</div>
        </Card>
        <Card className="p-3 md:p-4">
          <div className="text-2xl font-bold text-green-600">{draftStats.sent}</div>
          <div className="text-xs text-muted-foreground">Sent</div>
        </Card>
        <Card className="p-3 md:p-4">
          <div className="text-2xl font-bold text-destructive">{draftStats.failed}</div>
          <div className="text-xs text-muted-foreground">Failed</div>
        </Card>
        <Card className="p-3 md:p-4">
          <div className="text-2xl font-bold text-blue-500">{draftStats.sending}</div>
          <div className="text-xs text-muted-foreground">Sending</div>
        </Card>
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        {/* Upload & Create Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base md:text-lg flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Create Drafts
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Upload contacts and generate drafts for manual sending
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* File Upload */}
            <div className="space-y-2">
              <Label>Contact File (.txt or .csv)</Label>
              <Input
                type="file"
                accept=".txt,.csv"
                onChange={handleFileChange}
                className="cursor-pointer"
              />
              {uploadedFile && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  {uploadedFile.name}
                </div>
              )}
            </div>

            {/* Parsing results */}
            {parsedContacts.length > 0 && (
              <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    {validContacts.length} valid
                  </span>
                  {invalidContacts.length > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      {invalidContacts.length} invalid
                    </span>
                  )}
                </div>
                {invalidContacts.length > 0 && (
                  <ScrollArea className="h-20 text-xs">
                    {invalidContacts.map((c, i) => (
                      <div key={i} className="text-destructive/80 truncate">
                        {c.rawLine} - {c.skipReason}
                      </div>
                    ))}
                  </ScrollArea>
                )}
              </div>
            )}

            {/* Message Template */}
            <div className="space-y-2">
              <Label>Message Template</Label>
              <Textarea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder="Hey {first_name}, ..."
                rows={4}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Use {'{first_name}'} for personalization
              </p>
            </div>

            {/* Opt-out toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="opt-out" className="text-sm">Include opt-out footer</Label>
              <Switch
                id="opt-out"
                checked={includeOptOut}
                onCheckedChange={setIncludeOptOut}
              />
            </div>

            {/* Consent checkbox */}
            <div className="flex items-start gap-2">
              <Checkbox
                id="consent"
                checked={consentConfirmed}
                onCheckedChange={(checked) => setConsentConfirmed(checked === true)}
              />
              <Label htmlFor="consent" className="text-xs text-muted-foreground leading-tight">
                I confirm all recipients have given consent to receive these messages.
              </Label>
            </div>

            {/* Generate button */}
            <Button
              onClick={handleGenerateDrafts}
              disabled={creating || validContacts.length === 0 || !consentConfirmed}
              className="w-full"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Generate {validContacts.length} Drafts
            </Button>
          </CardContent>
        </Card>

        {/* Drafts List */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                <Send className="h-5 w-5" />
                Drafts Queue
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={fetchDrafts}
                  disabled={loadingDrafts}
                >
                  <RefreshCw className={cn("h-4 w-4", loadingDrafts && "animate-spin")} />
                </Button>
                {draftStats.draft > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearDrafts}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            {/* Filter tabs */}
            <div className="flex gap-1 mt-2 flex-wrap">
              {['all', 'draft', 'sent', 'failed'].map(status => (
                <Button
                  key={status}
                  variant={statusFilter === status ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(status)}
                  className="text-xs h-7"
                >
                  {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] md:h-[500px]">
              {loadingDrafts ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredDrafts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No drafts found
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredDrafts.map(draft => (
                    <div
                      key={draft.id}
                      className="p-3 border rounded-lg space-y-2 bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">
                              {draft.recipient_name || 'Unknown'}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {draft.recipient_phone}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {draft.message_body_final}
                          </p>
                        </div>
                        {getStatusBadge(draft.status)}
                      </div>
                      
                      {draft.error_message && (
                        <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                          {draft.error_message}
                        </p>
                      )}
                      
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(draft.created_at), 'MMM d, h:mm a')}
                        </span>
                        
                        <div className="flex items-center gap-1">
                          {draft.status === 'draft' && (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleSendDraft(draft.id)}
                                disabled={cooldownRemaining > 0 || sendingDraftId === draft.id}
                                className="h-7 text-xs gap-1"
                              >
                                {sendingDraftId === draft.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Send className="h-3 w-3" />
                                )}
                                Send
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteDraft(draft.id)}
                                className="h-7 text-xs text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {draft.status === 'failed' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSendDraft(draft.id)}
                              disabled={cooldownRemaining > 0 || sendingDraftId === draft.id}
                              className="h-7 text-xs gap-1"
                            >
                              <RefreshCw className="h-3 w-3" />
                              Retry
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
