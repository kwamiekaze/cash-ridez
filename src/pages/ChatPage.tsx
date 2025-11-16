import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send, Paperclip, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserChip } from "@/components/UserChip";
import AppHeader from "@/components/AppHeader";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useReadReceipts } from "@/hooks/useReadReceipts";
import { useAuth } from "@/contexts/AuthContext";

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [tripInfo, setTripInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { typingUsers, setTyping } = useTypingIndicator(id || '', 'ride', currentUserId);
  const { markAsRead, getReadBy } = useReadReceipts('ride_message', currentUserId, readReceiptsEnabled);
  
  let typingTimeout: NodeJS.Timeout;

  useEffect(() => {
    getCurrentUser();
    fetchTripInfo();
    fetchMessages();
    loadReadReceiptsPreference();

    // Subscribe to realtime messages
    const channel = supabase
      .channel('ride-messages-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ride_messages',
          filter: `ride_request_id=eq.${id}`
        },
        (payload) => {
          const newMsg = payload.new;
          setMessages(prev => [...prev, newMsg]);
          scrollToBottom();
          // Mark as read if it's not our message
          if (newMsg.sender_id !== currentUserId && readReceiptsEnabled) {
            markAsRead(newMsg.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      setTyping(false);
    };
  }, [id]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
  };

  const loadReadReceiptsPreference = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('notification_preferences')
        .eq('id', user.id)
        .single();
      
      if (data) {
        const prefs = data.notification_preferences as any;
        setReadReceiptsEnabled(prefs?.read_receipts ?? true);
      }
    } catch (error) {
      console.error('Error loading read receipts preference:', error);
    }
  };

  const fetchTripInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('ride_requests')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      
      // Fetch rider and driver profiles separately
      if (data) {
        const [riderProfile, driverProfile] = await Promise.all([
          supabase.from('profiles').select('display_name, full_name').eq('id', data.rider_id).single(),
          data.assigned_driver_id 
            ? supabase.from('profiles').select('display_name, full_name').eq('id', data.assigned_driver_id).single()
            : Promise.resolve({ data: null })
        ]);
        
        setTripInfo({
          ...data,
          rider: riderProfile.data,
          driver: driverProfile.data
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('ride_messages')
        .select('*')
        .eq('ride_request_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      // Fetch sender profiles separately
      if (data && data.length > 0) {
        const senderIds = [...new Set(data.map(msg => msg.sender_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, full_name')
          .in('id', senderIds);
        
        const profileMap = new Map(profiles?.map(p => [p.id, p]));
        const messagesWithSenders = data.map(msg => ({
          ...msg,
          sender: profileMap.get(msg.sender_id)
        }));
        
        setMessages(messagesWithSenders);
        
        // Mark all messages as read that aren't from current user
        if (readReceiptsEnabled && currentUserId) {
          messagesWithSenders
            .filter(msg => msg.sender_id !== currentUserId)
            .forEach(msg => markAsRead(msg.id));
        }
      } else {
        setMessages(data || []);
      }
      
      scrollToBottom();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUserId) return;

    setSending(true);
    setTyping(false);
    try {
      const { error } = await supabase
        .from('ride_messages')
        .insert({
          ride_request_id: id,
          sender_id: currentUserId,
          text: newMessage.trim()
        });

      if (error) throw error;

      setNewMessage("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleTyping = () => {
    setTyping(true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      setTyping(false);
    }, 3000);
  };

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      <div className="border-b">
        <div className="max-w-4xl mx-auto p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Trip Chat</h1>
              {tripInfo && (
                <p className="text-sm text-muted-foreground">
                  {tripInfo.pickup_address} → {tripInfo.dropoff_address}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Safety Tips */}
          <Card className="bg-muted/50 border-primary/20">
            <CardContent className="pt-4">
              <div className="space-y-2 text-sm">
                {tripInfo?.assigned_driver_id === currentUserId ? (
                  <div className="flex gap-2">
                    <span className="text-primary font-semibold">Driver Tip:</span>
                    <p className="text-muted-foreground">
                      Consider sharing your phone number and estimated arrival time with the rider for better coordination.
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <span className="text-primary font-semibold">Safety Reminder:</span>
                    <p className="text-muted-foreground">
                      Never send money to drivers before meeting in person. All payments should be handled face-to-face.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {messages.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">No messages yet. Start the conversation!</p>
              </CardContent>
            </Card>
          ) : (
            messages.map((message) => {
              const isCurrentUser = message.sender_id === currentUserId;
              return (
                <div
                  key={message.id}
                  className={`flex gap-3 ${isCurrentUser ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {(message.sender?.full_name || message.sender?.display_name || message.sender_id)?.charAt(0) || '?'}
                    </AvatarFallback>
                  </Avatar>
                   <div className={`flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'} max-w-[70%]`}>
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-2">
                        <span>{message.sender?.full_name || message.sender?.display_name || message.sender_id}</span>
                        {message.sender_id && (
                          <UserChip
                            userId={message.sender_id}
                            displayName={message.sender?.display_name}
                            fullName={message.sender?.full_name}
                            showCancellationBadge={true}
                            size="sm"
                            className="inline-flex"
                          />
                        )}
                      </div>
                     <div
                       className={`rounded-lg px-4 py-2 ${
                         isCurrentUser
                           ? 'bg-primary text-primary-foreground'
                           : 'bg-muted'
                       }`}
                     >
                       <p className="text-sm">{message.text}</p>
                     </div>
                     <div className="flex items-center gap-2 mt-1">
                       <span className="text-xs text-muted-foreground">
                         {new Date(message.created_at).toLocaleTimeString()}
                       </span>
                       {isCurrentUser && readReceiptsEnabled && getReadBy(message.id).length > 0 && (
                         <span className="text-xs text-muted-foreground">
                           · Read by {getReadBy(message.id).length}
                         </span>
                       )}
                     </div>
                   </div>
                </div>
              );
            })
          )}
          
          {/* Typing Indicator */}
          {typingUsers.length > 0 && (
            <div className="flex gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback>...</AvatarFallback>
              </Avatar>
              <div className="flex items-center gap-1 bg-muted rounded-lg px-4 py-2">
                <span className="text-sm text-muted-foreground">typing</span>
                <span className="flex gap-1">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                </span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t bg-background sticky bottom-0">
        <div className="max-w-4xl mx-auto">
          {/* Action Buttons Toolbar - Top */}
          <div className="px-4 pt-3 pb-2 border-b border-border/50 flex items-center gap-2">
            <Button 
              type="button" 
              variant="ghost" 
              size="sm"
              className="h-8 px-2"
              disabled
            >
              <Paperclip className="h-4 w-4" />
              <span className="sr-only">Attach file</span>
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              size="sm"
              className="h-8 px-2"
              disabled
            >
              <Camera className="h-4 w-4" />
              <span className="sr-only">Take photo</span>
            </Button>
            <div className="flex-1" />
            <span className="text-xs text-muted-foreground">Message attachments coming soon</span>
          </div>
          
          {/* Message Input - Bottom */}
          <form onSubmit={handleSendMessage} className="p-4">
            <div className="flex gap-2 items-end">
              <Input
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  handleTyping();
                }}
                disabled={sending}
                className="flex-1 min-h-[44px]"
                aria-label="Message input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
              />
              <Button 
                type="submit" 
                disabled={sending || !newMessage.trim()}
                className="min-h-[44px] px-4"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
