import { useEffect, useRef } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { useCriticalFlow } from '@/hooks/useCriticalFlow';
import { useAnalyticsEvents } from '@/hooks/useAnalyticsEvents';

const AUTO_UPDATE_DELAY_MS = 4000; // 4 seconds

export function AppUpdateBanner() {
  const { updateAvailable, triggerUpdate, dismissUpdate, isDismissed, newVersion } = useAppUpdate();
  const isInCriticalFlow = useCriticalFlow();
  const { trackEvent } = useAnalyticsEvents();
  const hasTrackedShow = useRef(false);
  const autoUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track when update banner is shown
  useEffect(() => {
    if (updateAvailable && !isDismissed && !hasTrackedShow.current) {
      hasTrackedShow.current = true;
      trackEvent({
        eventName: 'update_available_shown' as any,
        metadata: { newVersion }
      });
    }
  }, [updateAvailable, isDismissed, trackEvent, newVersion]);

  // Auto-update if not in critical flow
  useEffect(() => {
    if (updateAvailable && !isDismissed && !isInCriticalFlow) {
      autoUpdateTimeoutRef.current = setTimeout(() => {
        trackEvent({
          eventName: 'update_auto_triggered' as any,
          metadata: { newVersion }
        });
        triggerUpdate();
      }, AUTO_UPDATE_DELAY_MS);
    }

    return () => {
      if (autoUpdateTimeoutRef.current) {
        clearTimeout(autoUpdateTimeoutRef.current);
      }
    };
  }, [updateAvailable, isDismissed, isInCriticalFlow, triggerUpdate, trackEvent, newVersion]);

  const handleUpdateClick = () => {
    trackEvent({
      eventName: 'update_clicked' as any,
      metadata: { newVersion }
    });
    triggerUpdate();
  };

  const handleDismiss = () => {
    trackEvent({
      eventName: 'update_dismissed' as any,
      metadata: { newVersion }
    });
    dismissUpdate();
  };

  if (!updateAvailable || isDismissed) {
    return null;
  }

  // Critical flow: Show blocking modal
  if (isInCriticalFlow) {
    return (
      <AlertDialog open={true}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Update Available
            </AlertDialogTitle>
            <AlertDialogDescription>
              A new version of CashRidez is available. Please update to continue using the app with the latest features and improvements.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleDismiss} className="w-full sm:w-auto">
              Later
            </Button>
            <Button onClick={handleUpdateClick} className="w-full sm:w-auto">
              <RefreshCw className="mr-2 h-4 w-4" />
              Update Now
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // Non-critical: Show sticky banner with auto-update countdown
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-primary text-primary-foreground px-4 py-3 shadow-lg animate-in slide-in-from-top duration-300">
      <div className="container mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm font-medium">
            Updating to latest version...
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleUpdateClick}
            className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
          >
            Update Now
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
