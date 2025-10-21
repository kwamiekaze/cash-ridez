import { useState, useEffect } from "react";
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

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { playNotificationSound } = useBrowserNotifications();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
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
          // Play sound for new notifications
          playNotificationSound();
          // Refetch to get the new notification
          fetchNotifications();
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
      setNotifications(data);
      setUnreadCount(data.filter(n => !n.read).length);
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
    setUnreadCount(prev => Math.max(0, prev - 1));

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
      setUnreadCount(prev => prev + 1);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    // Get current unread notifications
    const unreadNotifications = notifications.filter(n => !n.read);
    if (unreadNotifications.length === 0) return;

    // Optimistically update local state first
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);

    // Update database
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);

    if (error) {
      console.error('Error marking all as read:', error);
      // Rollback on error
      fetchNotifications();
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    setOpen(false);
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const getNotificationIcon = (type: string) => {
    const iconClass = "w-8 h-8 rounded-full flex items-center justify-center";
    switch (type) {
      case 'message':
        return <div className={cn(iconClass, "bg-blue-500/20")}><Bell className="w-4 h-4 text-blue-500" /></div>;
      case 'offer':
        return <div className={cn(iconClass, "bg-green-500/20")}><Bell className="w-4 h-4 text-green-500" /></div>;
      case 'trip_accepted':
      case 'trip_assigned':
        return <div className={cn(iconClass, "bg-verified/20")}><Bell className="w-4 h-4 text-verified" /></div>;
      case 'trip_cancelled':
        return <div className={cn(iconClass, "bg-destructive/20")}><Bell className="w-4 h-4 text-destructive" /></div>;
      case 'verification_approved':
        return <div className={cn(iconClass, "bg-verified/20")}><Bell className="w-4 h-4 text-verified" /></div>;
      case 'verification_rejected':
        return <div className={cn(iconClass, "bg-warning/20")}><Bell className="w-4 h-4 text-warning" /></div>;
      default:
        return <div className={cn(iconClass, "bg-primary/20")}><Bell className="w-4 h-4 text-primary" /></div>;
    }
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
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
                  {getNotificationIcon(notification.type)}
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
