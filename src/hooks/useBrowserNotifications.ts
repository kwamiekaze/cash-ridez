import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export function useBrowserNotifications() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check if browser supports notifications
    setIsSupported('Notification' in window);
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (!isSupported) {
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  };

  const showNotification = (title: string, options?: NotificationOptions) => {
    if (!isSupported || permission !== 'granted') {
      return;
    }

    try {
      const notification = new Notification(title, {
        icon: '/icon.png',
        badge: '/icon.png',
        ...options,
      });

      // Play notification sound
      playNotificationSound();

      return notification;
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  };

  const playNotificationSound = () => {
    try {
      // Use the global custom notification sound
      if (typeof (window as any).playNotificationSound === 'function') {
        (window as any).playNotificationSound();
      }
    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  };

  // Listen for new notifications
  useEffect(() => {
    if (!user || permission !== 'granted') return;

    const channel = supabase
      .channel('browser-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          const notification = payload.new;
          showNotification(notification.title, {
            body: notification.message,
            tag: notification.id,
            requireInteraction: false,
            data: { link: notification.link },
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, permission]);

  return {
    isSupported,
    permission,
    requestPermission,
    showNotification,
    playNotificationSound,
  };
}
