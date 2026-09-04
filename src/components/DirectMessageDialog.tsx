import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Loader2, Edit2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { PremiumCrown } from "@/components/PremiumCrown";
import { playNotificationSound } from "@/hooks/useNotificationSound";

interface DirectMessageDialogProps {
  otherUserId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DirectMessage {
  id: string;
  message: string;
  sender_id: string;
  created_at: string;
}

export function DirectMessageDialog({ otherUserId, open, onOpenChange }: DirectMessageDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chatId, setChatId] = useState<string | null>(null);
  const [otherUserProfile, setOtherUserProfile] = useState<any>(null);
  const [chatName, setChatName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [customChatName, setCustomChatName] = useState("");
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && user && otherUserId) {
      initializeChat();
      checkSubscription();
      fetchAdminUsers();
    }
  }, [open, user, otherUserId]);

  const checkSubscription = async () => {
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_active")
      .eq("id", user.id)
      .single();
    
    setSubscriptionActive(profile?.subscription_active || false);

    // Check if user is admin
    const { data: adminData } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });
    setIsAdmin(Boolean(adminData));
  };

  const fetchAdminUsers = async () => {
    try {
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');
      
      if (adminRoles) {
        setAdminUserIds(new Set(adminRoles.map(r => r.user_id)));
      }
    } catch (error) {
      console.error('Error fetching admin users:', error);
    }
  };

  const initializeChat = async () => {
    if (!user) return;
    
    try {
      setLoading(true);

      // Get other user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, display_name, full_name, photo_url")
        .eq("id", otherUserId)
        .single();

      setOtherUserProfile(profile);

      // Get or create chat using the database function
      const { data: chatIdData, error: chatError } = await supabase.rpc(
        "get_or_create_direct_chat",
        {
          _participant_1_id: user.id,
          _participant_2_id: otherUserId,
        }
      );

      if (chatError) {
        if (chatError.message?.includes('subscription_active')) {
          toast({
            title: "Subscription Required",
            description: "You need an active subscription to start direct messages",
            variant: "destructive",
          });
          onOpenChange(false);
          return;
        }
        throw chatError;
      }

      setChatId(chatIdData);

      // Fetch chat details including custom name
      const { data: chatData } = await supabase
        .from("direct_chats")
        .select("chat_name")
        .eq("id", chatIdData)
        .single();

      // Set chat name (custom name or default to other user's name)
      const defaultName = profile?.full_name || profile?.display_name || "User";
      setChatName(chatData?.chat_name || defaultName);
      setCustomChatName(chatData?.chat_name || "");

      // Fetch messages
      const { data: messagesData } = await supabase
        .from("direct_messages")
        .select("*")
        .eq("chat_id", chatIdData)
        .order("created_at", { ascending: true });

      setMessages(messagesData || []);

      // Set up realtime subscription
      const channel = supabase
        .channel(`direct-chat-${chatIdData}-${Math.random().toString(36).slice(2, 10)}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "direct_messages",
            filter: `chat_id=eq.${chatIdData}`,
          },
          (payload) => {
            const newMsg = payload.new as DirectMessage;
            // Play sound for messages from other users
            if (newMsg.sender_id !== user?.id) {
              playNotificationSound();
            }
            setMessages((prev) => [...prev, newMsg]);
          }
        )
        .subscribe((status, err) => {
        if (err) console.warn('[realtime] subscription error:', err);
      });

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (error: any) {
      console.error("Error initializing chat:", error);
      toast({
        title: "Error",
        description: "Failed to load chat",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatId || !user) return;

    setSending(true);
    try {
      const { error } = await supabase.from("direct_messages").insert({
        chat_id: chatId,
        sender_id: user.id,
        message: newMessage.trim(),
      });

      if (error) throw error;
      setNewMessage("");
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleUpdateChatName = async () => {
    if (!chatId) return;

    try {
      const { error } = await supabase
        .from("direct_chats")
        .update({ chat_name: customChatName || null })
        .eq("id", chatId);

      if (error) throw error;

      setChatName(customChatName || (otherUserProfile?.full_name || otherUserProfile?.display_name || "User"));
      setEditingName(false);
      toast({
        title: "Success",
        description: "Chat name updated",
      });
    } catch (error: any) {
      console.error("Error updating chat name:", error);
      toast({
        title: "Error",
        description: "Failed to update chat name",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Admins always bypass subscription check
  if (!subscriptionActive && !isAdmin && !loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Subscription Required</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Direct messaging is available for subscribed members only. Please upgrade your subscription to use this feature.
          </p>
          <Button onClick={() => onOpenChange(false)} className="w-full">Close</Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl h-[80vh] sm:h-[600px] flex flex-col p-0">
        <DialogHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={customChatName}
                    onChange={(e) => setCustomChatName(e.target.value)}
                    placeholder="Chat name"
                    className="h-8"
                  />
                  <Button size="sm" onClick={handleUpdateChatName}>Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingName(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <DialogTitle className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={otherUserProfile?.photo_url} />
                      <AvatarFallback>
                        {otherUserProfile?.display_name?.[0] || "U"}
                      </AvatarFallback>
                    </Avatar>
                    {chatName}
                  </DialogTitle>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingName(true)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => {
                    const isOwn = msg.sender_id === user?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            {isOwn ? "You" : otherUserProfile?.full_name?.[0] || otherUserProfile?.display_name?.[0] || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`flex-1 ${isOwn ? "text-right" : ""}`}>
                          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1 justify-start">
                            {!isOwn && adminUserIds.has(msg.sender_id) && (
                              <PremiumCrown size={12} />
                            )}
                            {format(new Date(msg.created_at), "h:mm a")}
                          </div>
                          <div
                            className={`inline-block p-3 rounded-lg ${
                              isOwn
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            <p className="text-sm break-words">{msg.message}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            <form onSubmit={handleSend} className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  disabled={sending}
                  maxLength={isAdmin ? 1000 : 500}
                />
                <Button type="submit" disabled={!newMessage.trim() || sending}>
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
