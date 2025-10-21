import { useState, useEffect } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface ActiveRide {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  status: string;
  rider_id: string;
  assigned_driver_id: string;
  unread_count?: number;
}

export function FloatingChat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [activeRides, setActiveRides] = useState<ActiveRide[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);

  useEffect(() => {
    if (!user) return;

    fetchActiveRides();

    // Subscribe to ride updates
    const channel = supabase
      .channel('active-rides-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ride_requests',
          filter: `status=eq.assigned`,
        },
        () => {
          fetchActiveRides();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ride_messages',
        },
        () => {
          fetchActiveRides();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchActiveRides = async () => {
    if (!user) return;

    const { data: rides, error } = await supabase
      .from('ride_requests')
      .select('*')
      .or(`rider_id.eq.${user.id},assigned_driver_id.eq.${user.id}`)
      .eq('status', 'assigned')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching active rides:', error);
      return;
    }

    if (rides) {
      // Get unread message counts for each ride
      const ridesWithUnread = await Promise.all(
        rides.map(async (ride) => {
          const { count } = await supabase
            .from('ride_messages')
            .select('*', { count: 'exact', head: true })
            .eq('ride_request_id', ride.id)
            .neq('sender_id', user.id)
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

          return { ...ride, unread_count: count || 0 };
        })
      );

      setActiveRides(ridesWithUnread);
      setTotalUnread(ridesWithUnread.reduce((sum, ride) => sum + (ride.unread_count || 0), 0));
    }
  };

  const handleOpenChat = (rideId: string) => {
    setOpen(false);
    navigate(`/chat/${rideId}`);
  };

  if (!user) return null;

  return (
    <>
      {/* Floating Button */}
      <Button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 p-0",
          "hover:scale-110 transition-transform duration-200",
          totalUnread > 0 && "animate-pulse"
        )}
        size="icon"
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <>
            <MessageCircle className="h-6 w-6" />
            {totalUnread > 0 && (
              <Badge className="absolute -top-1 -right-1 h-6 w-6 flex items-center justify-center p-0 bg-destructive text-white animate-bounce">
                {totalUnread > 9 ? '9+' : totalUnread}
              </Badge>
            )}
          </>
        )}
      </Button>

      {/* Chat Panel */}
      {open && (
        <Card className="fixed bottom-24 right-6 w-80 shadow-2xl z-50 animate-in slide-in-from-bottom-5 duration-200">
          <CardHeader className="bg-primary text-primary-foreground">
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Active Chats
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[400px]">
              {activeRides.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No active chats</p>
                  <p className="text-xs mt-1">Chats appear when you have ongoing rides</p>
                </div>
              ) : (
                <div className="divide-y">
                  {activeRides.map((ride) => (
                    <button
                      key={ride.id}
                      onClick={() => handleOpenChat(ride.id)}
                      className="w-full p-4 text-left hover:bg-muted/50 transition-colors flex items-start gap-3 group"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/20 text-primary">
                          {ride.pickup_address.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-medium text-sm truncate group-hover:text-primary">
                            {ride.pickup_address}
                          </h4>
                          {ride.unread_count! > 0 && (
                            <Badge className="h-5 w-5 flex items-center justify-center p-0 bg-destructive text-white text-xs">
                              {ride.unread_count! > 9 ? '9+' : ride.unread_count}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          → {ride.dropoff_address}
                        </p>
                        <Badge variant="outline" className="text-xs mt-1">
                          Confirmed
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </>
  );
}
