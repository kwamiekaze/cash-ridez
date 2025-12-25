import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAnalyticsEvents } from "@/hooks/useAnalyticsEvents";

interface DriverTipsBannerProps {
  profile: {
    id: string;
    active_role?: string;
    driver_tips_banner_seen?: boolean;
  } | null;
  onDismiss?: () => void;
}

export function DriverTipsBanner({ profile, onDismiss }: DriverTipsBannerProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { trackEvent } = useAnalyticsEvents();
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  useEffect(() => {
    if (!profile || !user) return;
    
    // Only show for drivers who haven't seen the banner
    const isDriver = profile.active_role === 'driver';
    const hasSeen = profile.driver_tips_banner_seen === true;
    
    // Also check localStorage as fallback
    const localStorageKey = `driver_tips_banner_seen_${user.id}`;
    const hasSeenLocally = localStorage.getItem(localStorageKey) === 'true';
    
    if (isDriver && !hasSeen && !hasSeenLocally) {
      setIsVisible(true);
      // Track banner shown event
      trackEvent({
        eventName: 'tips_banner_shown',
        role: 'driver',
        pagePath: window.location.pathname
      });
    }
  }, [profile, user, trackEvent]);

  const dismissBanner = async (clickedViewTips: boolean = false) => {
    if (isDismissing || !user) return;
    setIsDismissing(true);
    
    // Track the appropriate event
    trackEvent({
      eventName: clickedViewTips ? 'tips_banner_clicked_view_tips' : 'tips_banner_dismissed',
      role: 'driver',
      pagePath: window.location.pathname
    });

    // Set localStorage immediately as fallback
    const localStorageKey = `driver_tips_banner_seen_${user.id}`;
    localStorage.setItem(localStorageKey, 'true');

    // Update database
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          driver_tips_banner_seen: true,
          driver_tips_banner_seen_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) {
        console.error('Failed to update banner seen status:', error);
        // localStorage already set, so banner won't show again in this session
      }
    } catch (err) {
      console.error('Error updating banner status:', err);
    }

    setIsVisible(false);
    onDismiss?.();

    if (clickedViewTips) {
      navigate('/driver/tips');
    }
  };

  if (!isVisible) return null;

  return (
    <Card className="mb-4 border-primary/50 bg-gradient-to-r from-primary/10 to-primary/5 shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
      <CardContent className="p-4 relative">
        {/* Close button */}
        <button
          onClick={() => dismissBanner(false)}
          className="absolute top-2 right-2 p-1 rounded-full hover:bg-primary/10 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Lightbulb className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground mb-1">
              New: Driver Tips
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Earn more and avoid issues—check the Driver Tips before your first trip.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => dismissBanner(true)}
                className="h-8"
              >
                View Tips
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => dismissBanner(false)}
                className="h-8 text-muted-foreground"
              >
                Not now
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
