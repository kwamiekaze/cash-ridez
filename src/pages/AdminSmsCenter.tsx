import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Loader2, Send, MessageSquare, Phone, User, History, ArrowLeft, AlertCircle, Inbox, Plus, Search, Activity, RefreshCw, Upload } from "lucide-react";
import { MapBackground } from "@/components/MapBackground";
import AppHeader from "@/components/AppHeader";
import AdminRoute from "@/components/AdminRoute";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { AutoTextTab } from "@/components/admin/AutoTextTab";
import { SmsCenterMobileNav } from "@/components/admin/SmsCenterMobileNav";
import { SmsStatusIcon, SmsStatusBadge } from "@/lib/smsStatusUtils";
// Derive all URLs from VITE_SUPABASE_URL (single source of truth)
const BACKEND_URL = import.meta.env.VITE_SUPABASE_URL || '';
const BACKEND_PROJECT_REF = (() => {
  try {
    return new URL(BACKEND_URL).hostname.split('.')[0];
  } catch {
    return 'unknown';
  }
})();
// Use v2 webhook which logs to webhook_events table for debugging
const INBOUND_WEBHOOK_URL = BACKEND_URL
  ? `${BACKEND_URL.replace(/\/$/, '')}/functions/v1/twilio-inbound-sms-webhook-v2`
  : "";
const INBOUND_WEBHOOK_URL_V1 = BACKEND_URL
  ? `${BACKEND_URL.replace(/\/$/, '')}/functions/v1/twilio-inbound-sms-webhook`
  : "";

// SMS character limits
const GSM7_SINGLE_LIMIT = 160;
const GSM7_MULTI_LIMIT = 153;
const UNICODE_SINGLE_LIMIT = 70;
const UNICODE_MULTI_LIMIT = 67;
const OPT_OUT_TEXT = "\n\nReply STOP to opt out.";

interface Conversation {
  id: string;
  participant_e164: string;
  twilio_number_e164: string;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
  created_at: string;
  matched_message_preview?: string | null; // From search function
}

interface SmsMessage {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  from_e164: string;
  to_e164: string;
  body: string;
  twilio_message_sid: string | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

interface SmsLog {
  id: string;
  created_at: string;
  to_number: string;
  body: string;
  twilio_message_sid: string | null;
  twilio_status: string | null;
  error_message: string | null;
  segments_count: number;
  include_opt_out: boolean;
}

interface UserWithPhone {
  id: string;
  full_name: string | null;
  display_name: string | null;
  email: string;
  phone_number: string | null;
}

const AdminSmsCenter = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Tab state
  const [activeTab, setActiveTab] = useState("inbox");
  
  // Compose form state
  const [recipient, setRecipient] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [includeOptOut, setIncludeOptOut] = useState(true);
  const [senderType, setSenderType] = useState<"messaging_service" | "phone_number">("messaging_service");
  const [sending, setSending] = useState(false);
  
  // Inbox state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [conversationSearch, setConversationSearch] = useState("");
  const [filterUnread, setFilterUnread] = useState(false);
  
  // Reply state
  const [replyBody, setReplyBody] = useState("");
  const [replyIncludeOptOut, setReplyIncludeOptOut] = useState(false);
  const [replying, setReplying] = useState(false);
  
  // Auto-scroll ref
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // User picker state
  const [users, setUsers] = useState<UserWithPhone[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // Logs state
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  
  // Diagnostics state
  const [pingResult, setPingResult] = useState<{ ok: boolean; time: number; error?: string } | null>(null);
  const [pinging, setPinging] = useState(false);
  const [diagnosticsInbound, setDiagnosticsInbound] = useState<any[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<any[]>([]);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [conversationCount, setConversationCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [simulatingInbound, setSimulatingInbound] = useState(false);
  const [showAdvancedDebug, setShowAdvancedDebug] = useState(false);

  // Load users with phone numbers
  useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true);
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, display_name, email, phone_number")
        .not("phone_number", "is", null)
        .order("full_name", { ascending: true });
      
      setUsers((data || []) as UserWithPhone[]);
      setLoadingUsers(false);
    };
    fetchUsers();
  }, []);

  // Load conversations - use search function if search term provided
  const fetchConversations = useCallback(async (searchTerm?: string) => {
    setLoadingConversations(true);
    
    if (searchTerm && searchTerm.trim().length > 0) {
      // Use the search RPC function for full-text search
      const { data, error } = await supabase
        .rpc('search_sms_conversations', { search_term: searchTerm.trim() });
      
      if (error) {
        console.error('[AdminSmsCenter] Search failed:', error);
        // Fall back to basic search
        const { data: fallbackData } = await supabase
          .from("admin_sms_conversations")
          .select("*")
          .or(`participant_e164.ilike.%${searchTerm}%,last_message_preview.ilike.%${searchTerm}%`)
          .order("last_message_at", { ascending: false });
        setConversations((fallbackData || []) as Conversation[]);
      } else {
        setConversations((data || []) as Conversation[]);
      }
    } else {
      // No search term - fetch all conversations
      const { data, error } = await supabase
        .from("admin_sms_conversations")
        .select("*")
        .order("last_message_at", { ascending: false });
      
      if (error) {
        console.error('[AdminSmsCenter] Failed to load conversations:', error);
      } else {
        setConversations((data || []) as Conversation[]);
      }
    }
    setLoadingConversations(false);
  }, []);

  // Debounced search effect
  useEffect(() => {
    if (activeTab === "inbox") {
      // Debounce search by 300ms
      const timeoutId = setTimeout(() => {
        fetchConversations(conversationSearch);
      }, conversationSearch ? 300 : 0);
      
      return () => clearTimeout(timeoutId);
    }
  }, [activeTab, fetchConversations, conversationSearch]);

  // Subscribe to realtime updates for conversations
  useEffect(() => {
    if (activeTab !== "inbox") return;

    const channel = supabase
      .channel('sms-conversations-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_sms_conversations' },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTab, fetchConversations]);

  // Load messages for selected conversation
  const fetchMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    const { data, error } = await supabase
      .from("admin_sms_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(100);
    
    if (error) {
      console.error('[AdminSmsCenter] Failed to load messages:', error);
    } else {
      setMessages((data || []) as SmsMessage[]);
    }
    setLoadingMessages(false);
  }, []);

  // When conversation is selected, load messages and mark as read
  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
      
      // Mark conversation as read
      if (selectedConversation.unread_count > 0) {
        supabase
          .from("admin_sms_conversations")
          .update({ unread_count: 0 })
          .eq("id", selectedConversation.id)
          .then(({ error }) => {
            if (error) {
              console.error('[AdminSmsCenter] Failed to mark as read:', error);
            } else {
              // Update local state
              setConversations(prev => 
                prev.map(c => c.id === selectedConversation.id ? { ...c, unread_count: 0 } : c)
              );
            }
          });
      }
    }
  }, [selectedConversation, fetchMessages]);

  // Subscribe to realtime updates for messages in selected conversation
  useEffect(() => {
    if (!selectedConversation) return;

    const channel = supabase
      .channel(`sms-messages-${selectedConversation.id}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'admin_sms_messages',
          filter: `conversation_id=eq.${selectedConversation.id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMessages(prev => [...prev, payload.new as SmsMessage]);
          } else if (payload.eventType === 'UPDATE') {
            setMessages(prev => 
              prev.map(m => m.id === (payload.new as SmsMessage).id ? payload.new as SmsMessage : m)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConversation]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Load SMS logs
  useEffect(() => {
    if (activeTab === "history") {
      fetchLogs();
    }
  }, [activeTab]);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    const { data } = await supabase
      .from("admin_sms_logs")
      .select("id, created_at, to_number, body, twilio_message_sid, twilio_status, error_message, segments_count, include_opt_out")
      .order("created_at", { ascending: false })
      .limit(100);
    
    setLogs((data || []) as SmsLog[]);
    setLoadingLogs(false);
  };

  // Load diagnostics data
  useEffect(() => {
    if (activeTab === "diagnostics") {
      fetchDiagnostics();
    }
  }, [activeTab]);

  const fetchDiagnostics = async () => {
    setDiagnosticsLoading(true);
    
    // Get last 10 inbound messages
    const { data: inboundMessages } = await supabase
      .from("admin_sms_messages")
      .select("id, created_at, direction, from_e164, to_e164, body, status, conversation_id")
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(10);
    
    setDiagnosticsInbound(inboundMessages || []);
    
    // Get last 10 webhook events
    const { data: events } = await supabase
      .from("admin_sms_webhook_events")
      .select("id, received_at, from_e164, to_e164, body, sms_sid, insert_ok, insert_error")
      .order("received_at", { ascending: false })
      .limit(10);
    
    setWebhookEvents(events || []);
    
    // Get counts
    const { count: convCount } = await supabase
      .from("admin_sms_conversations")
      .select("*", { count: "exact", head: true });
    
    const { count: msgCount } = await supabase
      .from("admin_sms_messages")
      .select("*", { count: "exact", head: true });
    
    setConversationCount(convCount || 0);
    setMessageCount(msgCount || 0);
    
    setDiagnosticsLoading(false);
  };

  // Simulate an inbound SMS (server-side test)
  const handleSimulateInbound = async () => {
    setSimulatingInbound(true);
    try {
      const testSid = `SM_TEST_SIM_${Date.now()}`;
      const testBody = `Test inbound simulation at ${new Date().toLocaleTimeString()}`;
      
      // Send to v2 webhook with JSON body
      const response = await fetch(INBOUND_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          From: '+14045551234',
          To: '+16789288816', // Twilio number
          Body: testBody,
          MessageSid: testSid,
          SmsSid: testSid,
          MessagingServiceSid: 'MGtest',
          NumMedia: '0'
        })
      });
      
      if (response.ok) {
        toast({ 
          title: 'Simulation sent', 
          description: `Test message posted to webhook. Check Webhook Events and Inbound Messages tables.` 
        });
        // Refresh diagnostics after a short delay
        setTimeout(() => fetchDiagnostics(), 1000);
      } else {
        toast({ 
          title: 'Simulation failed', 
          description: `HTTP ${response.status}`, 
          variant: 'destructive' 
        });
      }
    } catch (err: any) {
      toast({ 
        title: 'Simulation error', 
        description: err.message, 
        variant: 'destructive' 
      });
    } finally {
      setSimulatingInbound(false);
    }
  };

  const handlePingWebhook = async () => {
    setPinging(true);
    setPingResult(null);
    const start = Date.now();

    try {
      const response = await fetch(`${INBOUND_WEBHOOK_URL}?ping=1`);
      const elapsed = Date.now() - start;

      if (response.ok) {
        const text = await response.text();
        setPingResult({ ok: text === 'pong', time: elapsed });
      } else {
        setPingResult({ ok: false, time: elapsed, error: `HTTP ${response.status}` });
      }
    } catch (err: any) {
      setPingResult({ ok: false, time: Date.now() - start, error: err.message });
    } finally {
      setPinging(false);
    }
  };

  // Log resolved backend + inbound webhook values at runtime (console only)
  useEffect(() => {
    console.log('[AdminSmsCenter] backendUrl (VITE_SUPABASE_URL):', BACKEND_URL);
    console.log('[AdminSmsCenter] backendProjectRef:', BACKEND_PROJECT_REF);
    console.log('[AdminSmsCenter] inboundWebhookUrl (derived):', INBOUND_WEBHOOK_URL);
  }, []);

  // Filter conversations (search is now done server-side, only filter by unread locally)
  const filteredConversations = useMemo(() => {
    let filtered = conversations;
    
    if (filterUnread) {
      filtered = filtered.filter(c => c.unread_count > 0);
    }
    
    return filtered;
  }, [conversations, filterUnread]);

  // Filter users by search query
  const filteredUsers = useMemo(() => {
    if (!userSearchQuery.trim()) return users.slice(0, 50);
    const query = userSearchQuery.toLowerCase();
    return users.filter(u => 
      u.full_name?.toLowerCase().includes(query) ||
      u.display_name?.toLowerCase().includes(query) ||
      u.email?.toLowerCase().includes(query) ||
      u.phone_number?.includes(query)
    ).slice(0, 50);
  }, [users, userSearchQuery]);

  // Calculate message info
  const calculateMessageInfo = (body: string, withOptOut: boolean) => {
    const fullMessage = withOptOut ? body + OPT_OUT_TEXT : body;
    const length = fullMessage.length;
    
    const gsm7Regex = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ!"#¤%&'()*+,\-.\/:;<=>?¡ÄÖÑÜ§¿äöñüà0-9A-Za-z]*$/;
    const isGsm7 = gsm7Regex.test(fullMessage);
    
    const singleLimit = isGsm7 ? GSM7_SINGLE_LIMIT : UNICODE_SINGLE_LIMIT;
    const multiLimit = isGsm7 ? GSM7_MULTI_LIMIT : UNICODE_MULTI_LIMIT;
    
    let segments = 1;
    if (length > singleLimit) {
      segments = Math.ceil(length / multiLimit);
    }
    
    return { length, segments, isGsm7, encoding: isGsm7 ? 'GSM-7' : 'Unicode' };
  };

  const messageInfo = useMemo(() => calculateMessageInfo(messageBody, includeOptOut), [messageBody, includeOptOut]);
  const replyInfo = useMemo(() => calculateMessageInfo(replyBody, replyIncludeOptOut), [replyBody, replyIncludeOptOut]);

  // Validate E.164 format
  const isValidE164 = (phone: string): boolean => /^\+[1-9]\d{1,14}$/.test(phone);

  // Handle user selection
  const handleSelectUser = (userId: string) => {
    const selectedUser = users.find(u => u.id === userId);
    if (selectedUser?.phone_number) {
      let phone = selectedUser.phone_number.trim();
      if (!phone.startsWith('+')) {
        phone = phone.replace(/\D/g, '');
        if (phone.length === 10) phone = '+1' + phone;
        else if (phone.length === 11 && phone.startsWith('1')) phone = '+' + phone;
      }
      setRecipient(phone);
    }
  };

  // Send SMS (compose tab)
  const handleSend = async () => {
    if (!recipient.trim() || !isValidE164(recipient) || !messageBody.trim()) {
      toast({ title: "Error", description: "Valid recipient and message are required.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-send-sms', {
        body: { to: recipient, body: messageBody, includeOptOut }
      });

      if (error) throw error;

      if (data?.ok) {
        toast({ title: "SMS Sent!", description: `Message SID: ${data.sid}` });
        setRecipient("");
        setMessageBody("");
        fetchConversations();
      } else {
        toast({ title: "SMS Failed", description: data?.error || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to send SMS.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // Send reply in conversation
  const handleSendReply = async () => {
    if (!selectedConversation || !replyBody.trim()) return;

    setReplying(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-send-sms', {
        body: { 
          to: selectedConversation.participant_e164, 
          body: replyBody, 
          includeOptOut: replyIncludeOptOut 
        }
      });

      if (error) throw error;

      if (data?.ok) {
        setReplyBody("");
        // Message will appear via realtime subscription
      } else {
        toast({ title: "Failed to send", description: data?.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to send reply.", variant: "destructive" });
    } finally {
      setReplying(false);
    }
  };

  // Start new conversation
  const handleStartNewConversation = () => {
    setActiveTab("compose");
    setSelectedConversation(null);
  };

  // Status helpers now use the unified utility from smsStatusUtils

  // Calculate unread count
  const totalUnreadCount = useMemo(() => 
    conversations.reduce((sum, c) => sum + c.unread_count, 0), 
    [conversations]
  );

  return (
    <AdminRoute>
      <div className="min-h-screen bg-background relative">
        <MapBackground />
        {/* Hide AppHeader on mobile when in inbox and viewing a conversation */}
        <div className={cn(selectedConversation && activeTab === "inbox" ? "hidden md:block" : "")}>
          <AppHeader showStatus={false} />
        </div>

        {/* Mobile Navigation */}
        <SmsCenterMobileNav 
          activeTab={activeTab} 
          onTabChange={setActiveTab}
          unreadCount={totalUnreadCount}
        />

        <div className="container mx-auto px-4 py-4 md:py-6 relative z-10 max-w-6xl">
          {/* Desktop Header - Hidden on mobile */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 hidden md:block"
          >
            <div className="flex items-center gap-3 mb-4">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigate('/admin')}
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
                  <MessageSquare className="h-7 w-7" />
                  SMS Center
                </h1>
                <p className="text-muted-foreground text-sm">
                  Send and receive SMS messages
                </p>
              </div>
            </div>
          </motion.div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            {/* Desktop Tab List - Hidden on mobile (using drawer instead) */}
            <TabsList className="mb-6 hidden md:flex">
              <TabsTrigger value="inbox" className="gap-2">
                <Inbox className="h-4 w-4" />
                Inbox
                {totalUnreadCount > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                    {totalUnreadCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="compose" className="gap-2">
                <Send className="h-4 w-4" />
                Compose
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2">
                <History className="h-4 w-4" />
                History
              </TabsTrigger>
              <TabsTrigger value="diagnostics" className="gap-2">
                <Activity className="h-4 w-4" />
                Diagnostics
              </TabsTrigger>
              <TabsTrigger value="autotext" className="gap-2">
                <Upload className="h-4 w-4" />
                Auto Text
              </TabsTrigger>
            </TabsList>

            <TabsContent value="inbox" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-200px)] md:h-[calc(100vh-280px)] min-h-[400px]">
                {/* Left: Conversations list - Hidden on mobile when conversation selected */}
                <Card className={cn(
                  "bg-card/80 backdrop-blur-sm border-border/50 md:col-span-1 flex flex-col",
                  selectedConversation ? "hidden md:flex" : "flex"
                )}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Conversations</CardTitle>
                      <Button size="sm" variant="outline" onClick={handleStartNewConversation}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search messages..."
                          value={conversationSearch}
                          onChange={(e) => setConversationSearch(e.target.value)}
                          className="pl-8 h-8 text-sm"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant={filterUnread ? "default" : "outline"}
                        onClick={() => setFilterUnread(!filterUnread)}
                        className="text-xs"
                      >
                        Unread
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-hidden p-0">
                    <ScrollArea className="h-full">
                      {loadingConversations ? (
                        <div className="flex items-center justify-center p-8">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      ) : filteredConversations.length === 0 ? (
                        <div className="text-center p-8 text-muted-foreground">
                          <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No conversations</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-border/50">
                          {filteredConversations.map((conv) => (
                            <button
                              key={conv.id}
                              onClick={() => setSelectedConversation(conv)}
                              className={cn(
                                "w-full text-left p-3 hover:bg-accent/50 transition-colors",
                                selectedConversation?.id === conv.id && "bg-accent"
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <span className="font-medium text-sm truncate">
                                      {conv.participant_e164}
                                    </span>
                                    {conv.unread_count > 0 && (
                                      <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                                        {conv.unread_count}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate mt-1">
                                    {conversationSearch && conv.matched_message_preview 
                                      ? `"...${conv.matched_message_preview}..."` 
                                      : conv.last_message_preview || 'No messages'}
                                  </p>
                                </div>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Right: Message stream - Takes full width on mobile when conversation selected */}
                <Card className={cn(
                  "bg-card/80 backdrop-blur-sm border-border/50 md:col-span-2 flex flex-col",
                  selectedConversation ? "flex" : "hidden md:flex"
                )}>
                  {selectedConversation ? (
                    <>
                      <CardHeader className="pb-2 border-b border-border/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedConversation(null)}
                              className="md:hidden shrink-0 -ml-2"
                            >
                              <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <div>
                              <CardTitle className="text-base flex items-center gap-2">
                                <Phone className="h-4 w-4 hidden md:block" />
                                {selectedConversation.participant_e164}
                              </CardTitle>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                via {selectedConversation.twilio_number_e164}
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      
                      <CardContent className="flex-1 overflow-hidden p-0">
                        <ScrollArea className="h-full p-4">
                          {loadingMessages ? (
                            <div className="flex items-center justify-center p-8">
                              <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                          ) : messages.length === 0 ? (
                            <div className="text-center p-8 text-muted-foreground">
                              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">No messages yet</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {messages.map((msg) => (
                                <div
                                  key={msg.id}
                                  className={cn(
                                    "flex",
                                    msg.direction === 'outbound' ? "justify-end" : "justify-start"
                                  )}
                                >
                                  <div
                                    className={cn(
                                      "max-w-[85%] md:max-w-[80%] rounded-lg px-3 py-2",
                                      msg.direction === 'outbound'
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted"
                                    )}
                                  >
                                    <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                                    <div className={cn(
                                      "flex items-center gap-1 mt-1",
                                      msg.direction === 'outbound' ? "justify-end" : "justify-start"
                                    )}>
                                      <span className="text-[10px] opacity-70">
                                        {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                                      </span>
                                      {msg.direction === 'outbound' && (
                                        <SmsStatusIcon 
                                          status={msg.status}
                                          errorCode={msg.error_code}
                                          errorMessage={msg.error_message}
                                          timestamp={format(new Date(msg.created_at), 'MMM d, h:mm a')}
                                          messageSid={msg.twilio_message_sid}
                                          className="ml-1"
                                        />
                                      )}
                                    </div>
                                    {msg.error_message && (
                                      <p className="text-[10px] text-destructive mt-1">{msg.error_message}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                              <div ref={messagesEndRef} />
                            </div>
                          )}
                        </ScrollArea>
                      </CardContent>

                      {/* Reply composer - Safe area aware for mobile */}
                      <div className="p-3 border-t border-border/50 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                        <div className="flex items-center gap-2 mb-2">
                          <Switch
                            id="reply-opt-out"
                            checked={replyIncludeOptOut}
                            onCheckedChange={setReplyIncludeOptOut}
                            className="scale-75"
                          />
                          <Label htmlFor="reply-opt-out" className="text-xs text-muted-foreground cursor-pointer">
                            Opt-out footer
                          </Label>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {replyInfo.length} chars • {replyInfo.segments} seg
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <Textarea
                            placeholder="Type a reply..."
                            value={replyBody}
                            onChange={(e) => setReplyBody(e.target.value)}
                            className="resize-none min-h-[50px] md:min-h-[60px] flex-1"
                            rows={2}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                handleSendReply();
                              }
                            }}
                          />
                          <Button
                            onClick={handleSendReply}
                            disabled={replying || !replyBody.trim()}
                            className="self-end h-10 w-10 p-0 md:h-auto md:w-auto md:px-4"
                          >
                            {replying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                        <p>Select a conversation</p>
                        <Button variant="link" onClick={handleStartNewConversation} className="mt-2">
                          or start a new one
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            </TabsContent>

            {/* COMPOSE TAB */}
            <TabsContent value="compose">
              <Card className="bg-card/80 backdrop-blur-sm border-border/50 max-w-2xl mx-auto">
                <CardHeader>
                  <CardTitle className="text-lg">Send SMS</CardTitle>
                  <CardDescription>Compose and send an SMS message</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Sender Type */}
                  <div className="space-y-2">
                    <Label>Sender</Label>
                    <Select value={senderType} onValueChange={(v: "messaging_service" | "phone_number") => setSenderType(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="messaging_service">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Messaging Service (Recommended)
                          </div>
                        </SelectItem>
                        <SelectItem value="phone_number">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            Phone Number
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Recipient */}
                  <div className="space-y-2">
                    <Label>Recipient (E.164 format)</Label>
                    <Input
                      placeholder="+15551234567"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                    />
                    
                    {/* User picker */}
                    <div className="space-y-2 pt-2">
                      <Label className="text-muted-foreground text-xs">Or select a user:</Label>
                      <Input
                        placeholder="Search users..."
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        className="text-sm"
                      />
                      {userSearchQuery && (
                        <ScrollArea className="h-40 border rounded-md">
                          {loadingUsers ? (
                            <div className="flex items-center justify-center p-4">
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                          ) : filteredUsers.length === 0 ? (
                            <p className="text-muted-foreground text-sm p-4">No users found</p>
                          ) : (
                            <div className="p-2 space-y-1">
                              {filteredUsers.map((u) => (
                                <button
                                  key={u.id}
                                  onClick={() => {
                                    handleSelectUser(u.id);
                                    setUserSearchQuery("");
                                  }}
                                  className="w-full text-left px-3 py-2 rounded hover:bg-accent transition-colors text-sm"
                                >
                                  <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                      <p className="font-medium">{u.full_name || u.display_name || 'Unknown'}</p>
                                      <p className="text-xs text-muted-foreground">{u.email} • {u.phone_number}</p>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </ScrollArea>
                      )}
                    </div>
                    
                    {recipient && !isValidE164(recipient) && (
                      <p className="text-destructive text-xs flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Invalid E.164 format
                      </p>
                    )}
                  </div>

                  {/* Message Body */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Message</Label>
                      <span className="text-xs text-muted-foreground">
                        {messageInfo.length} chars • {messageInfo.segments} segment{messageInfo.segments > 1 ? 's' : ''}
                      </span>
                    </div>
                    <Textarea
                      placeholder="Type your message..."
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      rows={5}
                      className="resize-none"
                    />
                  </div>

                  {/* Opt-out toggle */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <Label htmlFor="opt-out" className="cursor-pointer">Append opt-out footer</Label>
                      <p className="text-xs text-muted-foreground mt-1">Adds "Reply STOP to opt out."</p>
                    </div>
                    <Switch id="opt-out" checked={includeOptOut} onCheckedChange={setIncludeOptOut} />
                  </div>

                  {/* Preview */}
                  {messageBody && (
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Preview</Label>
                      <div className="p-4 rounded-lg bg-muted/30 border text-sm whitespace-pre-wrap">
                        {messageBody}
                        {includeOptOut && <span className="text-muted-foreground">{OPT_OUT_TEXT}</span>}
                      </div>
                    </div>
                  )}

                  {/* Send Button */}
                  <Button
                    onClick={handleSend}
                    disabled={sending || !recipient || !messageBody || !isValidE164(recipient)}
                    className="w-full gap-2"
                    size="lg"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send Message
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* HISTORY TAB */}
            <TabsContent value="history">
              <Card className="bg-card/80 backdrop-blur-sm border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg">Send History</CardTitle>
                  <CardDescription>Recent outbound SMS logs</CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingLogs ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : logs.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No SMS logs yet</p>
                  ) : (
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-3">
                        {logs.map((log) => (
                          <div key={log.id} className="p-4 rounded-lg border bg-card/50">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Phone className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium">{log.to_number}</span>
                                  <SmsStatusBadge status={log.twilio_status} errorCode={log.error_message ? 'error' : null} />
                                </div>
                                <p className="text-sm text-muted-foreground line-clamp-2">{log.body}</p>
                                {log.error_message && (
                                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    {log.error_message}
                                  </p>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(log.created_at), 'MMM d, yyyy')}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(log.created_at), 'h:mm a')}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {log.segments_count} segment{log.segments_count > 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* DIAGNOSTICS TAB */}
            <TabsContent value="diagnostics">
              <div className="space-y-4">
                {/* Advanced Debug Panel (collapsible) */}
                <Card className="bg-card/80 backdrop-blur-sm border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <AlertCircle className="h-5 w-5" />
                        System Configuration
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAdvancedDebug(!showAdvancedDebug)}
                      >
                        {showAdvancedDebug ? 'Hide' : 'Show'} Advanced
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-2 text-xs">
                      <div className="flex justify-between p-2 bg-muted/50 rounded">
                        <span className="text-muted-foreground">FRONTEND_SUPABASE_URL</span>
                        <span className="font-mono truncate max-w-[300px]">{BACKEND_URL || 'NOT SET'}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-muted/50 rounded">
                        <span className="text-muted-foreground">PROJECT_REF</span>
                        <span className="font-mono">{BACKEND_PROJECT_REF}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-muted/50 rounded">
                        <span className="text-muted-foreground">INBOUND_WEBHOOK_URL (v2)</span>
                        <span className="font-mono truncate max-w-[400px]">{INBOUND_WEBHOOK_URL || 'NOT SET'}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-muted/50 rounded">
                        <span className="text-muted-foreground">Active Tables</span>
                        <span className="font-mono">admin_sms_conversations, admin_sms_messages, admin_sms_webhook_events</span>
                      </div>
                      <div className="flex justify-between p-2 bg-muted/50 rounded">
                        <span className="text-muted-foreground">Selected Conversation</span>
                        <span className="font-mono">{selectedConversation?.id || 'none'}</span>
                      </div>
                    </div>
                    
                    {showAdvancedDebug && (
                      <div className="pt-2 border-t space-y-2">
                        <div className="flex justify-between p-2 bg-muted/50 rounded text-xs">
                          <span className="text-muted-foreground">v1 Webhook (legacy)</span>
                          <span className="font-mono truncate max-w-[400px]">{INBOUND_WEBHOOK_URL_V1}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Use the v2 webhook URL above in Twilio. It logs all requests to admin_sms_webhook_events for debugging.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Webhook Health Check */}
                  <Card className="bg-card/80 backdrop-blur-sm border-border/50">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Webhook Health
                      </CardTitle>
                      <CardDescription>
                        Test the inbound SMS webhook endpoint
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="p-3 rounded-lg bg-muted/50 text-xs font-mono break-all">
                        {INBOUND_WEBHOOK_URL || 'Missing VITE_SUPABASE_URL'}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled={!INBOUND_WEBHOOK_URL}
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(INBOUND_WEBHOOK_URL);
                              toast({ title: 'Copied', description: 'Webhook URL copied to clipboard.' });
                            } catch (e: any) {
                              toast({ title: 'Copy failed', description: e?.message || 'Unable to copy.', variant: 'destructive' });
                            }
                          }}
                        >
                          Copy URL
                        </Button>
                        <Button
                          onClick={handlePingWebhook}
                          disabled={pinging || !INBOUND_WEBHOOK_URL}
                          className="flex-1 gap-2"
                        >
                          {pinging ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          Ping
                        </Button>
                      </div>

                      {pingResult && (
                        <div
                          className={cn(
                            "p-3 rounded-lg text-sm",
                            pingResult.ok ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"
                          )}
                        >
                          <p className="font-medium">
                            {pingResult.ok ? "✓ Webhook is healthy" : "✗ Webhook check failed"}
                          </p>
                          <p className="text-xs mt-1 opacity-80">
                            Response time: {pingResult.time}ms
                            {pingResult.error && ` • Error: ${pingResult.error}`}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Database Stats + Simulation */}
                  <Card className="bg-card/80 backdrop-blur-sm border-border/50">
                    <CardHeader>
                      <CardTitle className="text-lg">Database Stats</CardTitle>
                      <CardDescription>SMS tables overview & simulation</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {diagnosticsLoading ? (
                        <div className="flex items-center justify-center p-8">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex justify-between p-3 bg-muted/50 rounded-lg">
                            <span className="text-sm">Total Conversations</span>
                            <span className="font-medium">{conversationCount}</span>
                          </div>
                          <div className="flex justify-between p-3 bg-muted/50 rounded-lg">
                            <span className="text-sm">Total Messages</span>
                            <span className="font-medium">{messageCount}</span>
                          </div>
                          <div className="flex justify-between p-3 bg-muted/50 rounded-lg">
                            <span className="text-sm">Webhook Events (last 10)</span>
                            <span className="font-medium">{webhookEvents.length}</span>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={fetchDiagnostics}
                              className="flex-1"
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Refresh
                            </Button>
                            <Button 
                              variant="default" 
                              size="sm" 
                              onClick={handleSimulateInbound}
                              disabled={simulatingInbound}
                              className="flex-1"
                            >
                              {simulatingInbound ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                              Simulate Inbound
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Webhook Events (last 10) - THIS IS THE KEY DEBUG TABLE */}
                <Card className="bg-card/80 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Inbox className="h-5 w-5" />
                      Webhook Events (last 10)
                    </CardTitle>
                    <CardDescription>
                      Every request to the webhook is logged here. If empty after texting, Twilio isn't calling the webhook.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {diagnosticsLoading ? (
                      <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : webhookEvents.length === 0 ? (
                      <div className="text-center p-8 text-muted-foreground">
                        <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No webhook events found</p>
                        <p className="text-xs mt-2 opacity-70">
                          This means Twilio is NOT calling your webhook. Check Twilio Console configuration.
                        </p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[200px]">
                        <div className="space-y-2">
                          {webhookEvents.map((evt: any) => (
                            <div key={evt.id} className="p-3 rounded-lg border bg-card/50 text-sm">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <Phone className="h-3 w-3" />
                                    <span>From: {evt.from_e164 || '?'}</span>
                                    <span>→</span>
                                    <span>To: {evt.to_e164 || '?'}</span>
                                    {evt.sms_sid && <span className="font-mono opacity-50">SID: {evt.sms_sid.slice(0, 12)}...</span>}
                                  </div>
                                  <p className="truncate text-xs">{evt.body || '(empty body)'}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <Badge variant={evt.insert_ok ? 'default' : 'destructive'} className="text-xs">
                                    {evt.insert_ok ? 'OK' : 'FAIL'}
                                  </Badge>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {format(new Date(evt.received_at), 'h:mm:ss a')}
                                  </p>
                                  {evt.insert_error && (
                                    <p className="text-xs text-red-400 mt-1 truncate max-w-[150px]">{evt.insert_error}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>

                {/* Last 10 Inbound Messages */}
                <Card className="bg-card/80 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Last 10 Inbound Messages</CardTitle>
                    <CardDescription>
                      If Webhook Events shows entries but this is empty, the DB insert is failing.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {diagnosticsLoading ? (
                      <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : diagnosticsInbound.length === 0 ? (
                      <div className="text-center p-8 text-muted-foreground">
                        <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No inbound messages found in admin_sms_messages</p>
                        <p className="text-xs mt-2 opacity-70">
                          Use "Simulate Inbound" above to test the full flow.
                        </p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[200px]">
                        <div className="space-y-2">
                          {diagnosticsInbound.map((msg: any) => (
                            <div key={msg.id} className="p-3 rounded-lg border bg-card/50 text-sm">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <Phone className="h-3 w-3" />
                                    <span>From: {msg.from_e164}</span>
                                    <span>→</span>
                                    <span>To: {msg.to_e164}</span>
                                    <span className="font-mono opacity-50">Conv: {msg.conversation_id?.slice(0, 8)}...</span>
                                  </div>
                                  <p className="truncate">{msg.body || '(empty)'}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <Badge variant={msg.status === 'received' ? 'default' : 'secondary'} className="text-xs">
                                    {msg.status}
                                  </Badge>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {format(new Date(msg.created_at), 'MMM d, h:mm:ss a')}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>

                {/* Twilio Configuration Info */}
                <Card className="bg-card/80 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Twilio Configuration</CardTitle>
                    <CardDescription>
                      Configure Twilio to send inbound messages to this webhook
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="p-4 rounded-lg bg-amber-900/20 border border-amber-700/30">
                      <p className="text-sm text-amber-300 font-medium mb-2">Required Twilio Setup:</p>
                      <ol className="text-xs text-amber-200/80 space-y-1 list-decimal list-inside">
                        <li>Go to Twilio Console → Messaging → Services → Your Service</li>
                        <li>Under "Inbound Settings", set Request URL to:</li>
                        <li className="ml-4 font-mono bg-amber-950/50 p-1 rounded break-all">{INBOUND_WEBHOOK_URL}</li>
                        <li>Set HTTP method to POST</li>
                        <li>Save changes</li>
                      </ol>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* AUTO TEXT TAB */}
            <TabsContent value="autotext">
              <AutoTextTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AdminRoute>
  );
};

export default AdminSmsCenter;
