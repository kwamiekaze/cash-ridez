import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Minus, Send, Loader2, XCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { playNotificationSound } from '@/hooks/useNotificationSound';
import { format } from 'date-fns';
import { saveUIState, loadUIState } from '@/hooks/useAppPersistence';
import { PremiumCrown } from '@/components/PremiumCrown';
import { useToast } from '@/hooks/use-toast';

interface DirectMessage {
  id: string;
  message: string;
  sender_id: string;
  created_at: string;
}

interface ChatState {
  isOpen: boolean;
  isMinimized: boolean;
  activeThreadId: string | null;
}

const CHAT_STATE_KEY = 'chatBubble';

export function FloatingChatBubble() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [otherUserProfile, setOtherUserProfile] = useState<any>(null);
  const [chatStatus, setChatStatus] = useState<'open' | 'ended'>('open');
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  // Restore state on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    const savedState = loadUIState<ChatState>(CHAT_STATE_KEY);
    if (savedState) {
      setIsOpen(savedState.isOpen);
      setIsMinimized(savedState.isMinimized);
      if (savedState.activeThreadId) {
        setActiveThreadId(savedState.activeThreadId);
      }
    }
  }, []);

  // Handle deep-link from notification ?openChat=<chatId>
  useEffect(() => {
    const openChatId = searchParams.get('openChat');
    if (openChatId && user) {
      setActiveThreadId(openChatId);
      setIsOpen(true);
      setIsMinimized(false);
      // Clear the query param
      searchParams.delete('openChat');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, user, setSearchParams]);

  // Save state on changes
  useEffect(() => {
    saveUIState<ChatState>(CHAT_STATE_KEY, {
      isOpen,
      isMinimized,
      activeThreadId,
    });
  }, [isOpen, isMinimized, activeThreadId]);

  // Fetch admin user ids
  useEffect(() => {
    const fetchAdmins = async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');
      if (data) {
        setAdminUserIds(new Set(data.map(r => r.user_id)));
      }
    };
    fetchAdmins();
  }, []);

  // Fetch unread count for DMs
  useEffect(() => {
    if (!user) return;

    const fetchUnreadCount = async () => {
      // Count notifications of type direct_message that are unread
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('type', 'direct_message')
        .eq('read', false);
      
      setUnreadCount(count || 0);
    };

    fetchUnreadCount();

    // Subscribe to notification changes
    const channel = supabase
      .channel('dm-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Load chat when activeThreadId changes
  useEffect(() => {
    if (!activeThreadId || !user) return;
    
    loadChat(activeThreadId);
  }, [activeThreadId, user]);

  const loadChat = async (chatId: string) => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Fetch chat details
      const { data: chatData, error: chatError } = await supabase
        .from('direct_chats')
        .select('*')
        .eq('id', chatId)
        .single();

      if (chatError) throw chatError;

      setChatStatus((chatData as any).status || 'open');

      // Determine other user
      const otherUserId = chatData.participant_1_id === user.id 
        ? chatData.participant_2_id 
        : chatData.participant_1_id;

      // Fetch other user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, display_name, full_name, photo_url')
        .eq('id', otherUserId)
        .single();

      setOtherUserProfile(profile);

      // Fetch messages
      const { data: messagesData } = await supabase
        .from('direct_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      setMessages(messagesData || []);

      // Mark related notifications as read
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('chat_id', chatId)
        .eq('read', false);

      // Set up realtime subscription for this chat
      const channel = supabase
        .channel(`dm-bubble-${chatId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'direct_messages',
            filter: `chat_id=eq.${chatId}`,
          },
          (payload) => {
            const newMsg = payload.new as DirectMessage;
            if (newMsg.sender_id !== user.id) {
              playNotificationSound();
            }
            setMessages((prev) => [...prev, newMsg]);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (error) {
      console.error('Error loading chat:', error);
      toast({
        title: 'Error',
        description: 'Failed to load chat',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current && !isMinimized) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isMinimized]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeThreadId || !user || chatStatus === 'ended') return;

    setSending(true);
    try {
      const { error } = await supabase.from('direct_messages').insert({
        chat_id: activeThreadId,
        sender_id: user.id,
        message: newMessage.trim(),
      });

      if (error) throw error;
      setNewMessage('');
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const handleEndChat = async () => {
    if (!activeThreadId || !user) return;

    try {
      const { error } = await supabase
        .from('direct_chats')
        .update({
          status: 'ended',
          ended_by: user.id,
          ended_at: new Date().toISOString(),
        })
        .eq('id', activeThreadId);

      if (error) throw error;
      
      setChatStatus('ended');
      toast({
        title: 'Chat Ended',
        description: 'This conversation has been closed.',
      });
    } catch (error) {
      console.error('Error ending chat:', error);
      toast({
        title: 'Error',
        description: 'Failed to end chat',
        variant: 'destructive',
      });
    }
  };

  const handleReopenChat = async () => {
    if (!activeThreadId || !user) return;

    try {
      const { error } = await supabase
        .from('direct_chats')
        .update({
          status: 'open',
          ended_by: null,
          ended_at: null,
        })
        .eq('id', activeThreadId);

      if (error) throw error;
      
      setChatStatus('open');
      toast({
        title: 'Chat Reopened',
        description: 'You can now send messages again.',
      });
    } catch (error) {
      console.error('Error reopening chat:', error);
      toast({
        title: 'Error',
        description: 'Failed to reopen chat',
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setActiveThreadId(null);
    setMessages([]);
    setOtherUserProfile(null);
  };

  const handleMinimize = () => {
    setIsMinimized(true);
  };

  const handleExpand = () => {
    setIsMinimized(false);
  };

  const getChatTitle = () => {
    if (!otherUserProfile) return 'Chat';
    // Check if other user is admin
    if (adminUserIds.has(otherUserProfile.id)) {
      return 'CashRidez Support';
    }
    return otherUserProfile.full_name || otherUserProfile.display_name || 'User';
  };

  if (!user) return null;

  return (
    <>
      {/* Floating Bubble Button */}
      {(!isOpen || isMinimized) && (
        <Button
          onClick={() => {
            setIsOpen(true);
            setIsMinimized(false);
          }}
          className={cn(
            'fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 p-0',
            'hover:scale-110 transition-all duration-300',
            'bg-primary hover:bg-primary/90'
          )}
          size="icon"
        >
          <MessageCircle className="h-6 w-6" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-6 w-6 flex items-center justify-center p-0 bg-destructive text-white text-xs font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      )}

      {/* Chat Panel */}
      {isOpen && !isMinimized && (
        <Card className={cn(
          'fixed z-50 shadow-2xl animate-in slide-in-from-bottom-5 duration-200 flex flex-col overflow-hidden',
          // Mobile: full-width sheet at bottom
          'bottom-0 left-0 right-0 h-[70vh] rounded-t-2xl rounded-b-none',
          // Desktop: popup panel
          'sm:bottom-6 sm:right-6 sm:left-auto sm:w-[400px] sm:h-[500px] sm:rounded-xl'
        )}>
          {/* Header */}
          <CardHeader className="bg-primary text-primary-foreground p-3 flex flex-row items-center justify-between gap-2 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {otherUserProfile && (
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={otherUserProfile.photo_url} />
                  <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground">
                    {(otherUserProfile.display_name || 'U')[0]}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="flex items-center gap-1 min-w-0">
                {adminUserIds.has(otherUserProfile?.id || '') && (
                  <PremiumCrown size={14} />
                )}
                <span className="font-semibold truncate">{getChatTitle()}</span>
              </div>
              {chatStatus === 'ended' && (
                <Badge variant="secondary" className="text-xs flex-shrink-0">Ended</Badge>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {chatStatus === 'open' && activeThreadId && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
                  onClick={handleEndChat}
                  title="End Chat"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              )}
              {chatStatus === 'ended' && activeThreadId && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
                  onClick={handleReopenChat}
                  title="Reopen Chat"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
                onClick={handleMinimize}
                title="Minimize"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
                onClick={handleClose}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          {/* Content */}
          <CardContent className="flex-1 flex flex-col p-0 min-h-0 overflow-hidden">
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !activeThreadId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                <MessageCircle className="w-12 h-12 mb-2 opacity-50" />
                <p className="text-sm">No active conversation</p>
                <p className="text-xs mt-1">Click on a message notification to open chat</p>
              </div>
            ) : (
              <>
                {/* Messages */}
                <ScrollArea className="flex-1 p-3" ref={scrollRef}>
                  {messages.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      <p className="text-sm">No messages yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((msg) => {
                        const isOwn = msg.sender_id === user?.id;
                        const isAdmin = adminUserIds.has(msg.sender_id);
                        return (
                          <div
                            key={msg.id}
                            className={cn('flex gap-2', isOwn ? 'flex-row-reverse' : '')}
                          >
                            <Avatar className="h-7 w-7 flex-shrink-0">
                              <AvatarFallback className="text-xs">
                                {isOwn ? 'You' : isAdmin ? '★' : (otherUserProfile?.display_name?.[0] || 'U')}
                              </AvatarFallback>
                            </Avatar>
                            <div className={cn('flex-1 max-w-[75%]', isOwn ? 'text-right' : '')}>
                              <div className={cn(
                                'text-xs text-muted-foreground mb-0.5 flex items-center gap-1',
                                isOwn ? 'justify-end' : 'justify-start'
                              )}>
                                {!isOwn && isAdmin && <PremiumCrown size={10} />}
                                <span>{format(new Date(msg.created_at), 'h:mm a')}</span>
                              </div>
                              <div
                                className={cn(
                                  'inline-block px-3 py-2 rounded-lg text-sm break-words',
                                  isOwn
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted'
                                )}
                              >
                                {msg.message}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>

                {/* Chat Ended Notice */}
                {chatStatus === 'ended' && (
                  <div className="px-3 py-2 bg-muted/50 text-center text-sm text-muted-foreground border-t">
                    Chat ended. <button onClick={handleReopenChat} className="text-primary underline">Reopen</button> to send messages.
                  </div>
                )}

                {/* Input */}
                {chatStatus === 'open' && (
                  <form onSubmit={handleSend} className="p-3 border-t flex-shrink-0">
                    <div className="flex gap-2">
                      <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        disabled={sending}
                        className="flex-1"
                        maxLength={500}
                      />
                      <Button type="submit" size="icon" disabled={!newMessage.trim() || sending}>
                        {sending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </form>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
