import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, CheckCircle2, AlertCircle, Info, Minus } from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CancellationBadgeProps {
  userId: string;
  role?: "rider" | "driver" | "both";
  size?: "sm" | "md";
  showIcon?: boolean;
}

// Global cache for stats to avoid redundant fetches
const statsCache = new Map<string, any>();

export function CancellationBadge({ userId, role = "both", size = "sm", showIcon = true }: CancellationBadgeProps) {
  const [stats, setStats] = useState<any>(statsCache.get(userId) || null);
  const [loading, setLoading] = useState(!statsCache.has(userId));

  useEffect(() => {
    fetchStats();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`cancellation_stats:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cancellation_stats',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newData = payload.new as any;
          if (newData) {
            setStats(newData);
            statsCache.set(userId, newData);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const fetchStats = async () => {
    // Check cache first
    if (statsCache.has(userId)) {
      setStats(statsCache.get(userId));
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('cancellation_stats')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setStats(data);
        statsCache.set(userId, data);
      }
    } catch (error) {
      console.error('Error fetching cancellation stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) return null;

  const getVariant = (tier: string) => {
    switch (tier) {
      case 'green': return 'default';
      case 'yellow': return 'secondary';
      case 'red': return 'destructive';
      default: return 'default';
    }
  };

  const getIcon = (tier: string) => {
    switch (tier) {
      case 'green': return CheckCircle2;
      case 'yellow': return AlertCircle;
      case 'red': return AlertTriangle;
      default: return CheckCircle2;
    }
  };

  const Icon = getIcon(stats.badge_tier);
  const sizeClass = size === "sm" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5";

  const renderBadge = (roleType: "rider" | "driver") => {
    const rate90d = roleType === "rider" ? stats.rider_rate_90d : stats.driver_rate_90d;
    const rateLifetime = roleType === "rider" ? stats.rider_rate_lifetime : stats.driver_rate_lifetime;
    const committed90d = roleType === "rider" ? stats.rider_90d_committed : stats.driver_90d_committed;
    const cancels90d = roleType === "rider" ? stats.rider_90d_cancels : stats.driver_90d_cancels;
    const committedLifetime = roleType === "rider" ? stats.rider_lifetime_committed : stats.driver_lifetime_committed;
    const cancelsLifetime = roleType === "rider" ? stats.rider_lifetime_cancels : stats.driver_lifetime_cancels;

    if (committed90d === 0 && committedLifetime === 0) {
      return (
        <TooltipProvider key={roleType}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className={`${sizeClass} flex items-center gap-1 text-muted-foreground`}>
                <Minus className="h-3 w-3" />
                Cancel: —
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1 text-xs">
                <p className="font-semibold">No Trip History</p>
                <p>This user hasn't completed any trips yet.</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <TooltipProvider key={roleType}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant={getVariant(stats.badge_tier)} 
              className={`${sizeClass} flex items-center gap-1`}
              aria-label={`Cancellation rate ${rate90d.toFixed(0)} percent in last 90 days`}
            >
              {showIcon && <Icon className="h-3 w-3" />}
              Cancel: {rate90d.toFixed(0)}% (90d)
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="p-0 h-auto ml-1" onClick={(e) => e.stopPropagation()}>
                    <Info className="h-3 w-3" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Cancellation Rate Explained</DialogTitle>
                    <DialogDescription>
                      How we calculate reliability scores
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 text-sm">
                    <div>
                      <h4 className="font-semibold mb-2">90-Day Rate (Primary)</h4>
                      <p>Percentage of trips cancelled in the last 90 days. This is the main score shown.</p>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Lifetime Rate (Secondary)</h4>
                      <p>Overall cancellation rate across all trips ever taken.</p>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Color Coding</h4>
                      <ul className="space-y-1">
                        <li>🟢 Green: Under 5% (Excellent)</li>
                        <li>🟡 Yellow: 5-15% (Moderate)</li>
                        <li>🔴 Red: Over 15% (High risk)</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Notes</h4>
                      <p>Only trips that were committed to (accepted by a driver) count toward cancellation rates. Safety-related cancellations may not be counted.</p>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-1 text-xs">
              <p className="font-semibold capitalize">{roleType} Cancellation Rate</p>
              <p>90-day: {rate90d.toFixed(1)}% ({cancels90d.toFixed(1)}/{committed90d})</p>
              <p>Lifetime: {rateLifetime.toFixed(1)}% ({cancelsLifetime.toFixed(1)}/{committedLifetime})</p>
              <p className="text-muted-foreground mt-2">
                {rate90d < 5 && "Excellent reliability"}
                {rate90d >= 5 && rate90d <= 15 && "Moderate cancellation rate"}
                {rate90d > 15 && "High cancellation rate - caution advised"}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  if (role === "both") {
    const riderBadge = renderBadge("rider");
    const driverBadge = renderBadge("driver");
    
    if (!riderBadge && !driverBadge) {
      // Show neutral badge if no stats for either role
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className={`${sizeClass} flex items-center gap-1 text-muted-foreground`}>
                <Minus className="h-3 w-3" />
                Cancel: —
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1 text-xs">
                <p className="font-semibold">No Trip History</p>
                <p>This user hasn't completed any trips yet.</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {riderBadge}
        {driverBadge}
      </div>
    );
  }

  return renderBadge(role);
}
