import { useState, useMemo, useEffect } from "react";
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
import { Loader2, Send, MessageSquare, Phone, User, History, ArrowLeft, AlertCircle } from "lucide-react";
import { MapBackground } from "@/components/MapBackground";
import AppHeader from "@/components/AppHeader";
import AdminRoute from "@/components/AdminRoute";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";

// SMS character limits
const GSM7_SINGLE_LIMIT = 160;
const GSM7_MULTI_LIMIT = 153;
const UNICODE_SINGLE_LIMIT = 70;
const UNICODE_MULTI_LIMIT = 67;
const OPT_OUT_TEXT = "\n\nReply STOP to opt out.";

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
  
  // Form state
  const [recipient, setRecipient] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [includeOptOut, setIncludeOptOut] = useState(true);
  const [senderType, setSenderType] = useState<"messaging_service" | "phone_number">("messaging_service");
  const [sending, setSending] = useState(false);
  
  // User picker state
  const [users, setUsers] = useState<UserWithPhone[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // Logs state
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [activeTab, setActiveTab] = useState("compose");

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
  const messageInfo = useMemo(() => {
    const fullMessage = includeOptOut ? messageBody + OPT_OUT_TEXT : messageBody;
    const length = fullMessage.length;
    
    // Check for non-GSM-7 characters
    const gsm7Regex = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ!"#¤%&'()*+,\-.\/:;<=>?¡ÄÖÑÜ§¿äöñüà0-9A-Za-z]*$/;
    const isGsm7 = gsm7Regex.test(fullMessage);
    
    const singleLimit = isGsm7 ? GSM7_SINGLE_LIMIT : UNICODE_SINGLE_LIMIT;
    const multiLimit = isGsm7 ? GSM7_MULTI_LIMIT : UNICODE_MULTI_LIMIT;
    
    let segments = 1;
    if (length > singleLimit) {
      segments = Math.ceil(length / multiLimit);
    }
    
    const charsRemaining = segments === 1 
      ? singleLimit - length 
      : (segments * multiLimit) - length;
    
    return {
      length,
      segments,
      charsRemaining,
      isGsm7,
      encoding: isGsm7 ? 'GSM-7' : 'Unicode'
    };
  }, [messageBody, includeOptOut]);

  // Validate E.164 format
  const isValidE164 = (phone: string): boolean => {
    return /^\+[1-9]\d{1,14}$/.test(phone);
  };

  // Handle user selection
  const handleSelectUser = (userId: string) => {
    const selectedUser = users.find(u => u.id === userId);
    if (selectedUser?.phone_number) {
      // Ensure E.164 format
      let phone = selectedUser.phone_number.trim();
      if (!phone.startsWith('+')) {
        phone = phone.replace(/\D/g, '');
        if (phone.length === 10) {
          phone = '+1' + phone;
        } else if (phone.length === 11 && phone.startsWith('1')) {
          phone = '+' + phone;
        }
      }
      setRecipient(phone);
    }
  };

  // Send SMS
  const handleSend = async () => {
    if (!recipient.trim()) {
      toast({ title: "Error", description: "Recipient phone number is required.", variant: "destructive" });
      return;
    }

    if (!isValidE164(recipient)) {
      toast({ 
        title: "Invalid Phone Format", 
        description: "Phone number must be in E.164 format (e.g., +15551234567).", 
        variant: "destructive" 
      });
      return;
    }

    if (!messageBody.trim()) {
      toast({ title: "Error", description: "Message body is required.", variant: "destructive" });
      return;
    }

    if (messageInfo.length > 1500) {
      toast({ title: "Error", description: "Message is too long (max 1500 characters).", variant: "destructive" });
      return;
    }

    setSending(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-send-sms', {
        body: {
          to: recipient,
          body: messageBody,
          includeOptOut,
          fromNumber: senderType === "phone_number" ? undefined : undefined // Will use messaging service
        }
      });

      if (error) {
        throw error;
      }

      if (data?.ok) {
        toast({
          title: "SMS Sent!",
          description: `Message SID: ${data.sid} (${data.segments || 1} segment${data.segments > 1 ? 's' : ''})`,
        });
        
        // Reset form
        setRecipient("");
        setMessageBody("");
        
        // Refresh logs if on history tab
        if (activeTab === "history") {
          fetchLogs();
        }
      } else {
        toast({
          title: "SMS Failed",
          description: data?.error || "Unknown error occurred.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error('[AdminSmsCenter] Send error:', err);
      toast({
        title: "Error",
        description: err?.message || "Failed to send SMS.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return <Badge variant="secondary">Unknown</Badge>;
    
    const statusLower = status.toLowerCase();
    if (statusLower === 'delivered') {
      return <Badge className="bg-green-600">Delivered</Badge>;
    } else if (statusLower === 'sent') {
      return <Badge className="bg-blue-600">Sent</Badge>;
    } else if (statusLower === 'queued' || statusLower === 'sending') {
      return <Badge variant="secondary">Pending</Badge>;
    } else if (statusLower === 'failed' || statusLower === 'undelivered') {
      return <Badge variant="destructive">Failed</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  return (
    <AdminRoute>
      <div className="min-h-screen bg-background relative">
        <MapBackground />
        <AppHeader showStatus={false} />

        <div className="container mx-auto px-4 py-6 relative z-10 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
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
                  Send SMS messages to users via Twilio
                </p>
              </div>
            </div>
          </motion.div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="compose" className="gap-2">
                <Send className="h-4 w-4" />
                Compose
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2">
                <History className="h-4 w-4" />
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="compose">
              <Card className="bg-card/80 backdrop-blur-sm border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg">Send SMS</CardTitle>
                  <CardDescription>
                    Compose and send an SMS message to a single recipient
                  </CardDescription>
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
                            CashRidez Phone Number
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Recipient */}
                  <div className="space-y-2">
                    <Label>Recipient (E.164 format)</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="+15551234567"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        className="flex-1"
                      />
                    </div>
                    
                    {/* User picker */}
                    <div className="space-y-2 pt-2">
                      <Label className="text-muted-foreground text-xs">Or select a user:</Label>
                      <Input
                        placeholder="Search users by name, email, or phone..."
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
                        Invalid E.164 format. Use +[country code][number] (e.g., +15551234567)
                      </p>
                    )}
                  </div>

                  {/* Message Body */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Message</Label>
                      <span className="text-xs text-muted-foreground">
                        {messageInfo.length} chars • {messageInfo.segments} segment{messageInfo.segments > 1 ? 's' : ''} • {messageInfo.encoding}
                      </span>
                    </div>
                    <Textarea
                      placeholder="Type your message here..."
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      rows={5}
                      className="resize-none"
                    />
                    {messageInfo.segments > 1 && (
                      <p className="text-amber-500 text-xs flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Message will be split into {messageInfo.segments} SMS segments
                      </p>
                    )}
                  </div>

                  {/* Opt-out toggle */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <Label htmlFor="opt-out" className="cursor-pointer">Append opt-out footer</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Adds "Reply STOP to opt out." to the message
                      </p>
                    </div>
                    <Switch
                      id="opt-out"
                      checked={includeOptOut}
                      onCheckedChange={setIncludeOptOut}
                    />
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
                    {sending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Send SMS
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              <Card className="bg-card/80 backdrop-blur-sm border-border/50">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">SMS History</CardTitle>
                    <CardDescription>
                      Recent SMS messages sent from this admin panel
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loadingLogs}>
                    {loadingLogs ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
                  </Button>
                </CardHeader>
                <CardContent>
                  {loadingLogs ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No SMS messages sent yet</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-3">
                        {logs.map((log) => (
                          <div 
                            key={log.id} 
                            className="p-4 rounded-lg border bg-muted/30 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                <span className="font-mono text-sm">{log.to_number}</span>
                              </div>
                              {getStatusBadge(log.twilio_status)}
                            </div>
                            
                            <p className="text-sm whitespace-pre-wrap line-clamp-3">
                              {log.body}
                              {log.include_opt_out && (
                                <span className="text-muted-foreground">{OPT_OUT_TEXT}</span>
                              )}
                            </p>
                            
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{format(new Date(log.created_at), 'MMM d, yyyy h:mm a')}</span>
                              <div className="flex items-center gap-3">
                                {log.segments_count > 1 && (
                                  <span>{log.segments_count} segments</span>
                                )}
                                {log.twilio_message_sid && (
                                  <span className="font-mono text-[10px]">{log.twilio_message_sid.slice(0, 16)}...</span>
                                )}
                              </div>
                            </div>
                            
                            {log.error_message && (
                              <p className="text-destructive text-xs mt-2 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {log.error_message}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AdminRoute>
  );
};

export default AdminSmsCenter;
