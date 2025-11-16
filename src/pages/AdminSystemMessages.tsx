import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Megaphone, Plus, Trash2 } from "lucide-react";
import { SystemMessageDialog } from "@/components/SystemMessageDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import AdminRoute from "@/components/AdminRoute";
import AppHeader from "@/components/AppHeader";
import { MapBackground } from "@/components/MapBackground";

interface SystemMessage {
  id: string;
  title: string;
  message: string;
  target_roles: string[];
  is_published: boolean;
  published_at: string | null;
  created_at: string;
}

export default function AdminSystemMessages() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<SystemMessage[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from("system_messages")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setMessages(data || []);
    } catch (error: any) {
      console.error("Error fetching system messages:", error);
      toast({
        title: "Error",
        description: "Failed to fetch system messages",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this system message?")) return;

    try {
      const { error } = await supabase
        .from("system_messages")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "System message deleted",
      });

      fetchMessages();
    } catch (error: any) {
      console.error("Error deleting system message:", error);
      toast({
        title: "Error",
        description: "Failed to delete system message",
        variant: "destructive",
      });
    }
  };

  return (
    <AdminRoute>
      <div className="min-h-screen bg-background">
        <MapBackground />
        <AppHeader showStatus={false} />
        
        <div className="container mx-auto px-4 py-8 relative z-10">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Megaphone className="h-8 w-8 text-primary" />
                <h1 className="text-4xl font-bold text-primary">System Messages</h1>
              </div>
              <Button onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                New Message
              </Button>
            </div>

            <p className="text-muted-foreground mb-8">
              Send announcements and updates to all users or specific roles.
            </p>

            {loading ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  Loading messages...
                </CardContent>
              </Card>
            ) : messages.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No system messages yet. Create your first announcement!</p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="h-[calc(100vh-350px)]">
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <Card key={msg.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <CardTitle className="text-xl mb-2">{msg.title}</CardTitle>
                            <div className="flex flex-wrap gap-2 items-center">
                              <Badge
                                variant={msg.is_published ? "default" : "secondary"}
                                className="capitalize"
                              >
                                {msg.is_published ? "Published" : "Draft"}
                              </Badge>
                              {msg.target_roles.map((role) => (
                                <Badge key={role} variant="outline" className="capitalize">
                                  {role}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(msg.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">
                          {msg.published_at
                            ? `Published ${format(new Date(msg.published_at), "PPpp")}`
                            : `Created ${format(new Date(msg.created_at), "PPpp")}`}
                        </p>
                      </CardHeader>
                      <CardContent>
                        <p className="text-foreground whitespace-pre-wrap">{msg.message}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        <SystemMessageDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={fetchMessages}
        />
      </div>
    </AdminRoute>
  );
}
