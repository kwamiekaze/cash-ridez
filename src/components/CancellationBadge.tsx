import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, CheckCircle2, AlertCircle } from "lucide-react";

interface CancellationBadgeProps {
  userId: string;
  role?: "rider" | "driver" | "both";
  size?: "sm" | "md";
  showIcon?: boolean;
}

export function CancellationBadge({ userId, role = "both", size = "sm", showIcon = true }: CancellationBadgeProps) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [userId]);

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase
        .from('cancellation_stats')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      setStats(data);
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

    if (committed90d === 0 && committedLifetime === 0) return null;

    return (
      <TooltipProvider key={roleType}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant={getVariant(stats.badge_tier)} className={`${sizeClass} flex items-center gap-1`}>
              {showIcon && <Icon className="h-3 w-3" />}
              <span className="capitalize">{roleType}</span>: {rate90d.toFixed(1)}%
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
    
    if (!riderBadge && !driverBadge) return null;
    
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {riderBadge}
        {driverBadge}
      </div>
    );
  }

  return renderBadge(role);
}
