import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Phone, 
  Play, 
  Download, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Voicemail,
  RefreshCw,
  User,
  Calendar,
  Activity,
  MessageSquare
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface CallLog {
  id: string;
  created_at: string;
  first_name: string | null;
  phone_e164: string;
  status: string;
  call_type: string;
  call_duration_seconds: number | null;
  recording_url: string | null;
  voicemail_left: boolean;
  error_message: string | null;
  ai_conversation_summary: string | null;
  twilio_call_sid: string | null;
  admin_call_campaigns?: {
    name: string;
  } | null;
}

interface CallCenterMessage {
  id: string;
  twilio_call_sid: string;
  role: string;
  content: string;
  provider: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

const CallHistoryTab = () => {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [callMessages, setCallMessages] = useState<CallCenterMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [historyTab, setHistoryTab] = useState<'calls' | 'diagnostics'>('calls');

  useEffect(() => {
    loadCalls();

    // Subscribe to new calls
    const channel = supabase
      .channel(`call-history-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_call_logs',
        },
        () => {
          loadCalls();
        }
      )
      .subscribe((status, err) => {
        if (err) console.warn('[realtime] subscription error:', err);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (historyTab === 'diagnostics') {
      loadCallMessages();
    }
  }, [historyTab]);

  const loadCalls = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_call_logs')
        .select(`
          *,
          admin_call_campaigns (name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (data) {
        setCalls(data as CallLog[]);
      }
    } catch (error) {
      console.error('Error loading calls:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCallMessages = async () => {
    setIsLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('call_center_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (data) {
        setCallMessages(data as CallCenterMessage[]);
      }
    } catch (error) {
      console.error('Error loading call messages:', error);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const getStatusIcon = (status: string, voicemailLeft: boolean) => {
    if (voicemailLeft) {
      return <Voicemail className="w-4 h-4 text-orange-500" />;
    }
    switch (status) {
      case 'completed':
      case 'answered':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
      case 'no-answer':
      case 'busy':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'initiated':
      case 'ringing':
      case 'in-progress':
        return <Clock className="w-4 h-4 text-yellow-500 animate-pulse" />;
      default:
        return <Phone className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string, voicemailLeft: boolean) => {
    if (voicemailLeft) {
      return <Badge variant="outline" className="text-orange-500 border-orange-500/50">Voicemail</Badge>;
    }
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
      initiated: { variant: "secondary", label: "Initiated" },
      ringing: { variant: "secondary", label: "Ringing" },
      'in-progress': { variant: "default", label: "In Progress" },
      answered: { variant: "default", label: "Answered" },
      completed: { variant: "secondary", label: "Completed" },
      failed: { variant: "destructive", label: "Failed" },
      'no-answer': { variant: "destructive", label: "No Answer" },
      busy: { variant: "destructive", label: "Busy" },
      voicemail: { variant: "outline", label: "Voicemail" },
    };
    const config = variants[status] || { variant: "secondary", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const playRecording = (url: string) => {
    if (playingAudio === url) {
      setPlayingAudio(null);
    } else {
      setPlayingAudio(url);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'system':
        return <Badge variant="secondary" className="text-xs">System</Badge>;
      case 'assistant':
        return <Badge variant="default" className="text-xs">Assistant</Badge>;
      case 'user':
        return <Badge variant="outline" className="text-xs">User</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{role}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Call History</h2>
        <div className="flex items-center gap-2">
          <Tabs value={historyTab} onValueChange={(v) => setHistoryTab(v as 'calls' | 'diagnostics')}>
            <TabsList className="h-8">
              <TabsTrigger value="calls" className="text-xs gap-1 px-3 h-7">
                <Phone className="w-3 h-3" /> Calls
              </TabsTrigger>
              <TabsTrigger value="diagnostics" className="text-xs gap-1 px-3 h-7">
                <Activity className="w-3 h-3" /> Diagnostics
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={historyTab === 'calls' ? loadCalls : loadCallMessages} 
            disabled={isLoading || isLoadingMessages}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${(isLoading || isLoadingMessages) ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {historyTab === 'calls' ? (
        <>
          {calls.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Phone className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No call history yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Make your first call from the Compose tab
                </p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[calc(100vh-300px)]">
              <div className="space-y-3">
                {calls.map((call) => (
                  <Card key={call.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          {getStatusIcon(call.status, call.voicemail_left)}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm">{call.phone_e164}</span>
                              {call.first_name && (
                                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <User className="w-3 h-3" />
                                  {call.first_name}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(call.created_at), 'MMM d, yyyy h:mm a')}
                              {call.call_duration_seconds && (
                                <>
                                  <span>•</span>
                                  <Clock className="w-3 h-3" />
                                  {formatDuration(call.call_duration_seconds)}
                                </>
                              )}
                            </div>
                            {call.ai_conversation_summary && (
                              <p className="text-xs text-muted-foreground italic">
                                {call.ai_conversation_summary}
                              </p>
                            )}
                            {call.admin_call_campaigns?.name && (
                              <p className="text-xs text-muted-foreground">
                                Campaign: {call.admin_call_campaigns.name}
                              </p>
                            )}
                            {call.error_message && (
                              <p className="text-xs text-destructive mt-1">{call.error_message}</p>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {getStatusBadge(call.status, call.voicemail_left)}
                          
                          {call.recording_url && (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => playRecording(call.recording_url!)}
                              >
                                <Play className={`w-4 h-4 ${playingAudio === call.recording_url ? 'text-primary' : ''}`} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                asChild
                              >
                                <a 
                                  href={call.recording_url + '.mp3'} 
                                  download 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Audio Player */}
                      {playingAudio === call.recording_url && call.recording_url && (
                        <div className="mt-3 pt-3 border-t">
                          <audio
                            src={call.recording_url + '.mp3'}
                            controls
                            autoPlay
                            className="w-full h-8"
                            onEnded={() => setPlayingAudio(null)}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Stats Summary */}
          {calls.length > 0 && (
            <Card className="bg-muted/50">
              <CardContent className="py-4">
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold">{calls.length}</p>
                    <p className="text-xs text-muted-foreground">Total Calls</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-500">
                      {calls.filter(c => c.status === 'completed' || c.status === 'answered').length}
                    </p>
                    <p className="text-xs text-muted-foreground">Answered</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-orange-500">
                      {calls.filter(c => c.voicemail_left).length}
                    </p>
                    <p className="text-xs text-muted-foreground">Voicemails</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-500">
                      {calls.filter(c => ['failed', 'no-answer', 'busy'].includes(c.status)).length}
                    </p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        /* Diagnostics Tab */
        <div className="space-y-3">
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-500" />
                Call Flow Diagnostics
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              <p>Shows last 50 call events: TwiML requests, Gather outcomes, AMD results, MP3 plays, and hangups.</p>
              <p className="mt-1">Human-like flow: Call answered → Gather (2s timeout or speech) → Play MP3 → Hangup</p>
            </CardContent>
          </Card>

          {isLoadingMessages ? (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-2" />
              Loading diagnostics...
            </div>
          ) : callMessages.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No call events yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Make a call to see diagnostic logs
                </p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[calc(100vh-380px)]">
              <div className="space-y-2">
                {callMessages.map((msg) => (
                  <Card key={msg.id} className="overflow-hidden">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getRoleBadge(msg.role)}
                            {msg.provider && (
                              <Badge variant="outline" className="text-xs">
                                {msg.provider}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground font-mono">
                              {msg.twilio_call_sid ? msg.twilio_call_sid.slice(0, 16) + '...' : 'N/A'}
                            </span>
                          </div>
                          <p className="text-sm">{msg.content}</p>
                          {msg.metadata && (
                            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded mt-2 font-mono overflow-x-auto">
                              {Object.entries(msg.metadata).map(([key, value]) => (
                                <div key={key}>
                                  <span className="text-primary">{key}:</span>{' '}
                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(msg.created_at), 'h:mm:ss a')}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
};

export default CallHistoryTab;
