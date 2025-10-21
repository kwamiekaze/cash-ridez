import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Bell } from 'lucide-react';
import { useBrowserNotifications } from '@/hooks/useBrowserNotifications';

export function NotificationPermissionDialog() {
  const [open, setOpen] = useState(false);
  const { isSupported, permission, requestPermission } = useBrowserNotifications();

  useEffect(() => {
    // Show dialog after 2 seconds if notifications are supported and not yet decided
    if (isSupported && permission === 'default') {
      const timer = setTimeout(() => {
        setOpen(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isSupported, permission]);

  const handleEnable = async () => {
    const granted = await requestPermission();
    setOpen(false);
    if (granted) {
      // Show a welcome notification
      setTimeout(() => {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Notifications Enabled! 🎉', {
            body: 'You\'ll now receive real-time alerts for messages and ride updates.',
            icon: '/icon.png',
          });
        }
      }, 500);
    }
  };

  if (!isSupported) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Bell className="w-6 h-6 text-primary" />
            </div>
            <AlertDialogTitle className="text-xl">
              Stay Updated in Real-Time
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-base space-y-2">
            <p>
              Enable notifications to get instant alerts when:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>You receive new messages</li>
              <li>Drivers make offers on your trips</li>
              <li>Your ride is accepted</li>
              <li>Important trip updates occur</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-4">
              You'll hear a notification sound and see alerts even when CashRidez isn't open.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Maybe Later</AlertDialogCancel>
          <AlertDialogAction onClick={handleEnable} className="bg-primary">
            Enable Notifications
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
