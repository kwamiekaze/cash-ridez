import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Mail, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface EmailLog {
  id: string;
  user_id: string;
  email_type: string;
  recipient_email: string | null;
  timestamp_sent: string;
  status: string;
  error_message: string | null;
  metadata: any;
  created_at: string;
}

interface QueueItem {
  id: string;
  user_id: string;
  user_email: string;
  first_name: string | null;
  is_driver: boolean;
  is_rider: boolean;
  status: string;
  created_at: string;
  processed_at: string | null;
}

export function EmailLogsPanel() {
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [processing, setProcessing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch email logs
    const { data: logs } = await supabase
      .from("email_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    
    setEmailLogs(logs || []);

    // Fetch queue items
    const { data: queue } = await supabase
      .from("verification_email_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    
    setQueueItems(queue || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const sendTestEmail = async () => {
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        toast.error("No user email found");
        return;
      }

      const { data, error } = await supabase.functions.invoke('send-verification-welcome-email', {
        body: {
          userId: user.id,
          userEmail: user.email,
          firstName: 'Admin Test',
          isDriver: true,
          isRider: false,
          isTest: true
        }
      });

      if (error) throw error;
      
      toast.success("Test email sent! Check your inbox.");
      fetchData();
    } catch (err: any) {
      console.error("Test email error:", err);
      toast.error(`Failed to send test email: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const processQueue = async () => {
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-verification-welcome-email', {
        body: {}
      });

      if (error) throw error;
      
      if (data?.processed > 0) {
        toast.success(`Processed ${data.successful} emails (${data.failed} failed)`);
      } else {
        toast.info("No pending emails in queue");
      }
      fetchData();
    } catch (err: any) {
      console.error("Queue processing error:", err);
      toast.error(`Failed to process queue: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const retryFailedEmail = async (queueItem: QueueItem) => {
    try {
      // Reset queue item status to pending
      await supabase
        .from("verification_email_queue")
        .update({ status: "pending", processed_at: null })
        .eq("id", queueItem.id);

      toast.success("Email queued for retry");
      fetchData();
    } catch (err: any) {
      toast.error(`Failed to retry: ${err.message}`);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
      case "sent":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" /> {status}</Badge>;
      case "failed":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><AlertCircle className="w-3 h-3 mr-1" /> {status}</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><RefreshCw className="w-3 h-3 mr-1" /> {status}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const pendingCount = queueItems.filter(q => q.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2">
          <Button 
            onClick={fetchData} 
            variant="outline" 
            size="sm"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            onClick={sendTestEmail} 
            variant="outline" 
            size="sm"
            disabled={sending}
          >
            <Send className={`w-4 h-4 mr-2 ${sending ? 'animate-pulse' : ''}`} />
            Send Test Email
          </Button>
        </div>
        {pendingCount > 0 && (
          <Button 
            onClick={processQueue} 
            size="sm"
            disabled={processing}
            className="bg-primary text-primary-foreground"
          >
            <Mail className={`w-4 h-4 mr-2 ${processing ? 'animate-spin' : ''}`} />
            Process Queue ({pendingCount})
          </Button>
        )}
      </div>

      {/* Email Queue */}
      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Email Queue ({queueItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {queueItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No queue items</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {queueItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-2 rounded bg-background/50 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{item.user_email}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.first_name || "No name"} • {item.is_driver ? "Driver" : "Rider"} • {format(new Date(item.created_at), "MMM d, h:mm a")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(item.status)}
                    {item.status === "failed" && (
                      <Button size="sm" variant="ghost" onClick={() => retryFailedEmail(item)}>
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Logs */}
      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Email Logs (Last 50)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {emailLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No email logs yet</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {emailLogs.map((log) => (
                <div key={log.id} className="p-2 rounded bg-background/50 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{log.recipient_email}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.email_type} • {format(new Date(log.created_at), "MMM d, h:mm a")}
                      </p>
                    </div>
                    {getStatusBadge(log.status)}
                  </div>
                  {log.error_message && (
                    <p className="text-xs text-red-400 mt-1 truncate">{log.error_message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
