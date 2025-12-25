import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCallback } from "react";

export type AnalyticsEventName = 
  | 'tips_page_view'
  | 'tips_banner_shown'
  | 'tips_banner_dismissed'
  | 'tips_banner_clicked_view_tips';

interface TrackEventParams {
  eventName: AnalyticsEventName;
  pagePath?: string;
  role?: string;
  metadata?: Record<string, any>;
}

export function useAnalyticsEvents() {
  const { user } = useAuth();

  const trackEvent = useCallback(async ({ eventName, pagePath, role, metadata }: TrackEventParams) => {
    // Fire-and-forget - don't block UI
    try {
      const { error } = await supabase
        .from('analytics_events')
        .insert({
          user_id: user?.id || null,
          event_name: eventName,
          page_path: pagePath || null,
          role: role || null,
          metadata: metadata || null,
        });

      if (error) {
        // Silently ignore - don't show user-facing error
        console.debug('Analytics event failed:', error.message);
      }
    } catch (err) {
      // Silently ignore
      console.debug('Analytics event error:', err);
    }
  }, [user?.id]);

  return { trackEvent };
}
