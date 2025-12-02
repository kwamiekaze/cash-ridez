import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Trash2, Shield, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PremiumCrown } from "@/components/PremiumCrown";

interface Message {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  is_flagged?: boolean;
  sender?: {
    display_name: string;
    full_name: string | null;
    photo_url: string | null;
  };
}

export function CommunityChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [canSendMessage, setCanSendMessage] = useState(true);
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
  const [subscribedUserIds, setSubscribedUserIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Check user status
  useEffect(() => {
    const checkUserStatus = async () => {
      if (!user) return;
      
      // Check admin
      const { data: adminData } = await supabase.rpc('has_role', { 
        _user_id: user.id, 
        _role: 'admin' 
      });
      setIsAdmin(Boolean(adminData));

      // Fetch all admin user IDs
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');
      
      if (adminRoles) {
        setAdminUserIds(new Set(adminRoles.map(r => r.user_id)));
      }

      // Check message count and subscription
      const { data: profile } = await supabase
        .from("profiles")
        .select("chat_message_count, subscription_active, subscription_status, chat_blocked")
        .eq("id", user.id)
        .single();

      if (profile) {
        const hasPremium = profile.subscription_active && 
          (profile.subscription_status === 'active' || profile.subscription_status === 'trialing');
        
        setMessageCount(profile.chat_message_count || 0);
        setIsSubscribed(hasPremium);
        setCanSendMessage(
          !profile.chat_blocked && 
          (hasPremium || profile.chat_message_count < 10)
        );
      }
    };
    checkUserStatus();
  }, [user]);

  // Fetch messages
  useEffect(() => {
    const fetchMessages = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from("community_messages")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
        return;
      }

      if (data && data.length > 0) {
        // Fetch sender profiles including subscription status
        const userIds = [...new Set(data.map(m => m.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, full_name, photo_url, subscription_active, subscription_status")
          .in("id", userIds);

        // Build set of subscribed user IDs
        if (profiles) {
          const subscribedIds = new Set(
            profiles
              .filter(p => p.subscription_active && (p.subscription_status === 'active' || p.subscription_status === 'trialing'))
              .map(p => p.id)
          );
          setSubscribedUserIds(subscribedIds);
        }

        // Check which messages are flagged
        const { data: flags } = await supabase
          .from("user_message_flags")
          .select("content_id")
          .eq("content_type", "community_message");

        const flaggedIds = new Set(flags?.map(f => f.content_id) || []);

        const enrichedMessages = data.map(msg => ({
          ...msg,
          sender: profiles?.find(p => p.id === msg.user_id),
          is_flagged: flaggedIds.has(msg.id)
        }));

        setMessages(enrichedMessages);
      }
    };

    fetchMessages();

    // Set up realtime subscription
    const channel = supabase
      .channel('community_chat')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_messages'
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          
          // Fetch sender profile with subscription status
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, display_name, full_name, photo_url, subscription_active, subscription_status")
            .eq("id", newMsg.user_id)
            .single();

          // Update subscribed users set if needed
          if (profile && profile.subscription_active && 
              (profile.subscription_status === 'active' || profile.subscription_status === 'trialing')) {
            setSubscribedUserIds(prev => new Set([...prev, profile.id]));
          }

          setMessages(prev => [...prev, {
            ...newMsg,
            sender: profile || undefined
          }]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !canSendMessage) return;

    setSending(true);
    const { error } = await supabase
      .from("community_messages")
      .insert({
        user_id: user.id,
        message: newMessage.trim()
      });

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } else {
      setNewMessage("");
      // Refresh message count after sending
      const { data: profile } = await supabase
        .from("profiles")
        .select("chat_message_count, subscription_active")
        .eq("id", user.id)
        .single();

      if (profile) {
        setMessageCount(profile.chat_message_count || 0);
        setCanSendMessage(
          (profile.subscription_active || profile.chat_message_count < 10)
        );
      }
    }
    setSending(false);
  };

  const handleDelete = async (messageId: string) => {
    const { error } = await supabase
      .from("community_messages")
      .delete()
      .eq("id", messageId);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } else {
      setMessages(prev => prev.filter(m => m.id !== messageId));
      toast({
        title: "Success",
        description: "Message deleted"
      });
    }
  };

  const handleModerateUser = async (userId: string, action: 'mute' | 'block') => {
    if (!isAdmin) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        chat_muted: action === 'mute',
        chat_blocked: action === 'block'
      })
      .eq("id", userId);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Success",
        description: `User ${action}ed from chat`
      });
    }
  };

  const handleApproveMessage = async (messageId: string) => {
    if (!isAdmin) return;

    const { error } = await supabase
      .from("user_message_flags")
      .delete()
      .eq("content_id", messageId)
      .eq("content_type", "community_message");

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } else {
      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, is_flagged: false } : m
      ));
      toast({
        title: "Success",
        description: "Message approved"
      });
    }
  };

  const handleDeleteFlaggedMessage = async (messageId: string) => {
    if (!isAdmin) return;

    // Delete both the flag and the message
    const [flagError, msgError] = await Promise.all([
      supabase.from("user_message_flags").delete().eq("content_id", messageId).eq("content_type", "community_message"),
      supabase.from("community_messages").delete().eq("id", messageId)
    ]);

    if (flagError.error || msgError.error) {
      toast({
        title: "Error",
        description: flagError.error?.message || msgError.error?.message,
        variant: "destructive"
      });
    } else {
      setMessages(prev => prev.filter(m => m.id !== messageId));
      toast({
        title: "Success",
        description: "Message deleted"
      });
    }
  };

  return (
    <Card className="flex flex-col h-[600px] bg-card/80 backdrop-blur-sm">
      <div className="p-4 border-b border-border">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          💬 Community Chat
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Connect with verified drivers and riders in your area
        </p>
        {isAdmin && (
          <Button
            size="sm"
            variant="destructive"
            onClick={async () => {
              if (confirm("Are you sure you want to clear all messages in this chat?")) {
                const { error } = await supabase
                  .from("community_messages")
                  .delete()
                  .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
                
                if (error) {
                  toast({ title: "Error", description: error.message, variant: "destructive" });
                } else {
                  toast({ title: "Success", description: "Chat cleared" });
                  setMessages([]);
                }
              }
            }}
            className="mt-2"
          >
            Clear Chat
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 p-4 relative" ref={scrollRef}>
        {/* Message Counter in Top Right */}
        <div className="absolute top-2 right-2 px-3 py-1 bg-card border border-border rounded-full shadow-sm z-10">
          <span className="text-sm font-medium text-foreground">
            {messageCount}/10
          </span>
        </div>

        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No messages yet. Start the conversation!
            </div>
          ) : (
            messages.map((msg) => {
              const isOwnMessage = msg.user_id === user?.id;
              const isFlagged = msg.is_flagged && !isAdmin;
              const isFlaggedForAdmin = msg.is_flagged && isAdmin;
              
              // Hide flagged messages from non-admins
              if (isFlagged) return null;
              
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isOwnMessage ? "flex-row-reverse" : ""} ${isFlaggedForAdmin ? "bg-yellow-500/10 p-2 rounded-lg border border-yellow-500/20" : ""}`}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={msg.sender?.photo_url || undefined} />
                    <AvatarFallback>
                      {msg.sender?.full_name?.[0] || msg.sender?.display_name?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>

                  <div className={`flex-1 ${isOwnMessage ? "text-right" : ""}`}>
                    <div className={`flex items-center gap-2 mb-1 ${isOwnMessage ? "justify-end" : ""}`}>
                      <span className="text-sm font-medium flex items-center gap-1">
                        {msg.sender?.full_name || msg.sender?.display_name || "User"}
                        {(adminUserIds.has(msg.user_id) || subscribedUserIds.has(msg.user_id)) && (
                          <PremiumCrown size={14} />
                        )}
                      </span>
                      {isFlaggedForAdmin && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500 text-white">
                          Flagged
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(msg.created_at), "h:mm a")}
                      </span>
                      {(isOwnMessage || isAdmin) && (
                        <>
                          {!isFlaggedForAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => handleDelete(msg.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                          {isAdmin && !isOwnMessage && (
                            <>
                              {isFlaggedForAdmin ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2"
                                    onClick={() => handleApproveMessage(msg.id)}
                                    title="Approve message"
                                  >
                                    <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
                                    <span className="text-xs">Approve</span>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2"
                                    onClick={() => handleDeleteFlaggedMessage(msg.id)}
                                    title="Delete message"
                                  >
                                    <Trash2 className="h-3 w-3 mr-1 text-destructive" />
                                    <span className="text-xs">Delete</span>
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => handleModerateUser(msg.user_id, 'mute')}
                                    title="Mute user"
                                  >
                                    <Shield className="h-3 w-3 text-yellow-500" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => handleModerateUser(msg.user_id, 'block')}
                                    title="Block user"
                                  >
                                    <Shield className="h-3 w-3 text-destructive" />
                                  </Button>
                                </>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </div>
                    <div
                      className={`inline-block p-3 rounded-lg ${
                        isOwnMessage
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <p className="text-sm break-words">{msg.message}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      <form onSubmit={handleSend} className="p-4 border-t border-border">
        {!canSendMessage && !isSubscribed && (
          <div className="mb-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              You've reached your free message limit. Subscribe to continue chatting!
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={canSendMessage ? "Type a message..." : "Subscribe to send messages"}
            disabled={sending || !canSendMessage}
            maxLength={isAdmin ? 1000 : 500}
          />
          <Button type="submit" disabled={!newMessage.trim() || sending || !canSendMessage}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </Card>
  );
}