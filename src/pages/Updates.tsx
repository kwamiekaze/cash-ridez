import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import AppHeader from "@/components/AppHeader";
import { MapBackground } from "@/components/MapBackground";
import { Megaphone } from "lucide-react";

interface SystemMessage {
  id: string;
  title: string;
  message: string;
  target_roles: string[];
  published_at: string;
  created_at: string;
}

export default function Updates() {
  const [messages, setMessages] = useState<SystemMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from("system_messages")
        .select("*")
        .eq("is_published", true)
        .order("published_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setMessages(data || []);
    } catch (error: any) {
      console.error("Error fetching system messages:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <MapBackground />
      <AppHeader showStatus={false} />
      
      <div className="container mx-auto px-4 py-8 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Megaphone className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold text-primary">Platform Updates</h1>
          </div>
          
          <p className="text-muted-foreground mb-8">
            Stay informed with the latest announcements and updates from the CashRidez team.
          </p>

          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Loading updates...
              </CardContent>
            </Card>
          ) : messages.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No updates yet. Check back later!</p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[calc(100vh-300px)]">
              <div className="space-y-4">
                {messages.map((msg) => (
                  <Card key={msg.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <CardTitle className="text-xl">{msg.title}</CardTitle>
                        <div className="flex flex-wrap gap-2">
                          {msg.target_roles.map((role) => (
                            <Badge key={role} variant="secondary" className="capitalize">
                              {role}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(msg.published_at), "PPpp")}
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
    </div>
  );
}
