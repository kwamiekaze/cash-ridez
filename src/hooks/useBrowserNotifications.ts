import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { playNotificationSound as playSound } from './useNotificationSound';

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
      // Unlock audio on permission request (user gesture)
      if (typeof (window as any).unlockNotificationSound === 'function') {
        (window as any).unlockNotificationSound();
      }
      
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  };

  const showNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (!isSupported || permission !== 'granted') {
      // Still play sound even if notifications not allowed
      playNotificationSound();
      return;
    }

    try {
      const notification = new Notification(title, {
        icon: '/icon.png',
        badge: '/icon.png',
        tag: 'cashridez-' + Date.now(), // Unique tag to allow multiple notifications
        silent: false, // Ensure not silent
        ...options,
      });

      // Play notification sound
      playNotificationSound();

      // Auto-close after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);

      return notification;
    } catch (error) {
      console.error('Error showing notification:', error);
      // Still play sound on error
      playNotificationSound();
    }
  }, [isSupported, permission]);

  const playNotificationSound = useCallback(() => {
    try {
      playSound();
    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  }, []);

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
