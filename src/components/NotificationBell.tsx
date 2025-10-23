import { useState, useEffect, useMemo } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  created_at: string;
  related_user_id: string | null;
}

interface RelatedUser {
  id: string;
  display_name: string | null;
  full_name: string | null;
  photo_url: string | null;
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { playNotificationSound } = useBrowserNotifications();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [relatedUsers, setRelatedUsers] = useState<Record<string, RelatedUser>>({});
  // derive count from notifications to avoid state desync
  const unreadCount = useMemo(() => notifications.reduce((c, n) => c + ((n.read ?? false) ? 0 : 1), 0), [notifications]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Fetch initial notifications
    fetchNotifications();

    // Set up real-time subscription
    const channel = supabase
      .channel('notifications-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT', // Only listen for new notifications
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = (payload as any).new as Notification | undefined;
          if (newNotif) {
            // Optimistically prepend and cap list
            const normalized = { ...newNotif, read: newNotif.read ?? false } as Notification;
            setNotifications((prev) => [normalized, ...prev].slice(0, 20));
          }
          // Play sound for new notifications
          playNotificationSound();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchNotifications = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      // Normalize null reads to false
      const normalized = data.map(n => ({ ...n, read: n.read ?? false })) as Notification[];
      setNotifications(normalized);
      
      // Fetch related user profiles for driver_available notifications
      const relatedUserIds = [...new Set(
        normalized
          .filter(n => n.related_user_id)
          .map(n => n.related_user_id!)
      )];
      
      if (relatedUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, full_name, photo_url')
          .in('id', relatedUserIds);
        
        if (profiles) {
          const usersMap: Record<string, RelatedUser> = {};
          profiles.forEach(p => {
            usersMap[p.id] = p;
          });
          setRelatedUsers(usersMap);
        }
      }
    }
  };

  const markAsRead = async (notificationId: string) => {
    // Find the notification to check if it's already read
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification || notification.read) return; // Already read, nothing to do

    // Optimistically update local state first
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );

    // Update in database
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);

    if (error) {
      console.error('Error marking notification as read:', error);
      // Rollback on error
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: false } : n)
      );
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    // Get current unread notifications
    const unreadNotifications = notifications.filter(n => !n.read);
    if (unreadNotifications.length === 0) return;

    // Optimistically update local state first
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));


    // Update database - mark all user's notifications as read (handles nulls too)
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id);


    if (error) {
      console.error('Error marking all as read:', error);
      // Rollback on error
      fetchNotifications();
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    await markAsRead(notification.id);
    setOpen(false);
    
    // For driver_available notifications, go to the drivers tab in rider dashboard
    if (notification.type === 'driver_available') {
      navigate('/rider?tab=drivers');
    } else if (notification.link) {
      navigate(notification.link);
    }
  };

  const getNotificationIcon = (notification: Notification) => {
    const iconClass = "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0";
    
    // For driver_available notifications, show driver's avatar
    if (notification.type === 'driver_available' && notification.related_user_id) {
      const relatedUser = relatedUsers[notification.related_user_id];
      if (relatedUser) {
        const initials = (relatedUser.full_name || relatedUser.display_name || 'D')
          .split(' ')
          .map(n => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);
        
        return (
          <Avatar className="w-10 h-10 flex-shrink-0">
            <AvatarImage src={relatedUser.photo_url || undefined} alt={relatedUser.display_name || 'Driver'} />
            <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
        );
      }
    }
    
    // Default icons for other notification types
    const type = notification.type;
    switch (type) {
      case 'message':
        return <div className={cn(iconClass, "bg-blue-500/20")}><Bell className="w-4 h-4 text-blue-500" /></div>;
      case 'offer':
        return <div className={cn(iconClass, "bg-green-500/20")}><Bell className="w-4 h-4 text-green-500" /></div>;
      case 'trip_accepted':
      case 'trip_assigned':
      case 'trip_completed':
        return <div className={cn(iconClass, "bg-verified/20")}><Bell className="w-4 h-4 text-verified" /></div>;
      case 'trip_cancelled':
        return <div className={cn(iconClass, "bg-destructive/20")}><Bell className="w-4 h-4 text-destructive" /></div>;
      case 'rating_reminder':
        return <div className={cn(iconClass, "bg-warning/20")}><Bell className="w-4 h-4 text-warning" /></div>;
      case 'rating_received':
        return <div className={cn(iconClass, "bg-primary/20")}><Bell className="w-4 h-4 text-primary" /></div>;
      case 'completion_reminder':
        return <div className={cn(iconClass, "bg-blue-500/20")}><Bell className="w-4 h-4 text-blue-500" /></div>;
      case 'verification_approved':
        return <div className={cn(iconClass, "bg-verified/20")}><Bell className="w-4 h-4 text-verified" /></div>;
      case 'verification_rejected':
        return <div className={cn(iconClass, "bg-warning/20")}><Bell className="w-4 h-4 text-warning" /></div>;
      case 'driver_available':
        return <div className={cn(iconClass, "bg-primary/20")}><Bell className="w-4 h-4 text-primary" /></div>;
      default:
        return <div className={cn(iconClass, "bg-primary/20")}><Bell className="w-4 h-4 text-primary" /></div>;
    }
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (nextOpen && unreadCount > 0) { markAllAsRead(); } }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" onClick={() => { if (unreadCount > 0) markAllAsRead(); }}>
          <Bell className={cn(
            "h-5 w-5 transition-all",
            unreadCount > 0 && "text-primary"
          )} />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-6 w-6 flex items-center justify-center p-0 bg-destructive text-white text-xs font-bold shadow-lg"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-xs"
            >
              Mark all as read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      "w-full p-4 text-left hover:bg-muted/50 transition-colors flex gap-3 relative",
                      !notification.read && "bg-primary/10 border-l-4 border-l-primary"
                    )}
                  >
                  {getNotificationIcon(notification)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className={cn(
                        "font-medium text-sm",
                        !notification.read && "text-primary font-bold"
                      )}>
                        {notification.title}
                      </h4>
                      {!notification.read && (
                        <div className="w-3 h-3 rounded-full bg-primary flex-shrink-0 mt-1 shadow-lg shadow-primary/50" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-1">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
