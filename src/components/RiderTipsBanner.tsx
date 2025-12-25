import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAnalyticsEvents } from "@/hooks/useAnalyticsEvents";

interface RiderTipsBannerProps {
  profile: {
    id: string;
    active_role?: string;
    rider_tips_visited?: boolean;
    rider_tips_dismissed?: boolean;
  } | null;
  onDismiss?: () => void;
}

export function RiderTipsBanner({ profile, onDismiss }: RiderTipsBannerProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { trackEvent } = useAnalyticsEvents();
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  useEffect(() => {
    if (!profile || !user) return;
    
    // Only show for riders who haven't visited tips AND haven't dismissed
    const isRider = profile.active_role === 'rider';
    const hasVisited = profile.rider_tips_visited === true;
    const hasDismissed = profile.rider_tips_dismissed === true;
    
    if (isRider && !hasVisited && !hasDismissed) {
      setIsVisible(true);
      // Track banner shown event
      trackEvent({
        eventName: 'tips_banner_shown',
        role: 'rider',
        pagePath: window.location.pathname
      });
    }
  }, [profile, user, trackEvent]);

  const handleLearnMore = async () => {
    if (isDismissing || !user) return;
    setIsDismissing(true);
    
    // Track event
    trackEvent({
      eventName: 'tips_banner_learn_more_clicked',
      role: 'rider',
      pagePath: window.location.pathname
    });

    setIsVisible(false);
    onDismiss?.();
    navigate('/rider/tips');
  };

  const handleDismiss = async () => {
    if (isDismissing || !user) return;
    setIsDismissing(true);
    
    // Track event
    trackEvent({
      eventName: 'tips_banner_dismissed',
      role: 'rider',
      pagePath: window.location.pathname
    });

    // Update database to permanently dismiss
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          rider_tips_dismissed: true,
          rider_tips_dismissed_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) {
        console.error('Failed to update banner dismissed status:', error);
      }
    } catch (err) {
      console.error('Error updating banner status:', err);
    }

    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible) return null;

  return (
    <Card className="mb-4 border-primary/50 bg-gradient-to-r from-primary/10 to-primary/5 shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
      <CardContent className="p-4 relative">
        {/* Close button */}
        <button
          onClick={handleDismiss}
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
              New: Rider Tips
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Get more rides accepted—check the Rider Tips before posting your first trip.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={handleLearnMore}
                className="h-8"
              >
                Learn More
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                className="h-8 text-muted-foreground"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
