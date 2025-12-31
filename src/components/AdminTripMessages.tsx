import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Loader2, AlertCircle, XCircle, CheckCircle } from "lucide-react";
import { format } from "date-fns";

interface AdminTripMessagesProps {
  tripId: string;
  riderId: string;
  driverId: string | null;
  tripStatus?: string;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  cancelReasonCode?: string | null;
}

interface Message {
  id: string;
  sender_id: string;
  text: string;
  attachment_url?: string;
  created_at: string;
}

interface UserProfile {
  id: string;
  display_name: string | null;
  full_name: string | null;
  photo_url: string | null;
}

export function AdminTripMessages({ 
  tripId, 
  riderId, 
  driverId, 
  tripStatus,
  cancelledBy,
  cancelledAt,
  cancelReasonCode
}: AdminTripMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});

  useEffect(() => {
    fetchMessages();
  }, [tripId]);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const { data: messagesData, error } = await supabase
        .from('ride_messages')
        .select('*')
        .eq('ride_request_id', tripId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMessages(messagesData || []);

      const userIds = new Set<string>();
      userIds.add(riderId);
      if (driverId) userIds.add(driverId);
      messagesData?.forEach(m => userIds.add(m.sender_id));

      if (userIds.size > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, display_name, full_name, photo_url')
          .in('id', Array.from(userIds));

        const profileMap: Record<string, UserProfile> = {};
        profilesData?.forEach(p => {
          profileMap[p.id] = p;
        });
        setProfiles(profileMap);
      }
    } catch (error) {
      console.error('Error fetching trip messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const getUserRole = (senderId: string): 'rider' | 'driver' | 'unknown' => {
    if (senderId === riderId) return 'rider';
    if (senderId === driverId) return 'driver';
    return 'unknown';
  };

  const getUserName = (senderId: string): string => {
    const profile = profiles[senderId];
    return profile?.full_name || profile?.display_name || 'Unknown User';
  };

  const getCancelledByLabel = () => {
    if (!cancelledBy) return 'Unknown';
    if (cancelledBy === 'rider') return getUserName(riderId);
    if (cancelledBy === 'driver' && driverId) return getUserName(driverId);
    if (cancelledBy === 'admin') return 'Admin';
    if (cancelledBy === 'system') return 'System';
    return cancelledBy;
  };

  if (loading) {
    return (
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <MessageSquare className="h-4 w-4" />
            Trip Messages (Admin View)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm flex-wrap">
          <MessageSquare className="h-4 w-4" />
          Trip Messages (Admin View)
          <Badge variant="secondary" className="ml-2">
            {messages.length} messages
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cancellation Info */}
        {tripStatus === 'cancelled' && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
            <div className="flex items-start gap-2">
              <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <div className="text-sm space-y-1 min-w-0">
                <p className="font-medium text-destructive">Trip Cancelled</p>
                <p className="text-muted-foreground">
                  Cancelled by: <span className="font-medium">{getCancelledByLabel()}</span>
                  {cancelReasonCode && (
                    <> • Reason: <span className="font-medium">{cancelReasonCode.replace(/_/g, ' ')}</span></>
                  )}
                </p>
                {cancelledAt && (
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(cancelledAt), 'MMM d, yyyy h:mm a')}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {tripStatus === 'completed' && (
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm font-medium text-green-700 dark:text-green-400">Trip Completed</p>
            </div>
          </div>
        )}

        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No messages exchanged for this trip
          </p>
        ) : (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-4">
              {messages.map((message) => {
                const role = getUserRole(message.sender_id);
                const profile = profiles[message.sender_id];
                
                return (
                  <div key={message.id} className="flex gap-3">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage src={profile?.photo_url || undefined} />
                      <AvatarFallback className="text-xs">
                        {getUserName(message.sender_id)[0]?.toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-medium truncate">
                          {getUserName(message.sender_id)}
                        </span>
                        <Badge 
                          variant={role === 'rider' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {role}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(message.created_at), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      <div className="bg-muted rounded-lg px-3 py-2">
                        {message.attachment_url && (
                          <div className="mb-2">
                            {message.text.includes('📷') ? (
                              <img 
                                src={message.attachment_url} 
                                alt="Attachment" 
                                className="rounded max-w-full max-h-32 object-cover cursor-pointer"
                                onClick={() => window.open(message.attachment_url, '_blank')}
                              />
                            ) : (
                              <a 
                                href={message.attachment_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-sm text-primary underline"
                              >
                                View Attachment
                              </a>
                            )}
                          </div>
                        )}
                        <p className="text-sm break-words">{message.text}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}