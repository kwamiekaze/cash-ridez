import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, AlertCircle, Info } from "lucide-react";
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
  const [dialogOpen, setDialogOpen] = useState(false);

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
      .subscribe((status, err) => {
        if (err) console.warn('[realtime] subscription error:', err);
      });

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

  const getTitle = (tier: string) => {
    switch (tier) {
      case 'green': return 'Excellent Reliability';
      case 'yellow': return 'Fair Reliability';
      case 'red': return 'Poor Reliability';
      default: return 'Reliability Status';
    }
  };

  const getBadgeClass = (tier: string) => {
    switch (tier) {
      case 'green': return 'text-green-600';
      case 'yellow': return 'text-yellow-600';
      case 'red': return 'text-red-600';
      default: return '';
    }
  };

  const formatRate = (rate: number) => {
    return Math.round(rate * 100) / 100;
  };

  const sizeClass = size === "sm" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5";
  const showPercentage = true;

  if (loading) {
    return null;
  }

  // Always render for all users - even if no stats yet
  if (!stats) {
    // Show 0% badge if no stats available yet
    return (
      <Badge variant="default" className={`${sizeClass} flex items-center gap-1`} title="No cancellation history yet">
        <CheckCircle2 className="h-3 w-3" />
        {showPercentage && <span>0%</span>}
      </Badge>
    );
  }

  const renderBadge = (roleType: "rider" | "driver") => {
    const rate90d = roleType === "rider" ? (stats?.rider_rate_90d || 0) : (stats?.driver_rate_90d || 0);
    const rateLifetime = roleType === "rider" ? (stats?.rider_rate_lifetime || 0) : (stats?.driver_rate_lifetime || 0);
    const committed90d = roleType === "rider" ? (stats?.rider_90d_committed || 0) : (stats?.driver_90d_committed || 0);
    const cancels90d = roleType === "rider" ? (stats?.rider_90d_cancels || 0) : (stats?.driver_90d_cancels || 0);
    const committedLifetime = roleType === "rider" ? (stats?.rider_lifetime_committed || 0) : (stats?.driver_lifetime_committed || 0);
    const cancelsLifetime = roleType === "rider" ? (stats?.rider_lifetime_cancels || 0) : (stats?.driver_lifetime_cancels || 0);
    const chargeableCancels = roleType === "rider" ? (stats?.rider_cancels_chargeable || 0) : (stats?.driver_cancels_chargeable || 0);
    const totalCommitted = roleType === "rider" ? (stats?.rider_total_committed || 0) : (stats?.driver_total_committed || 0);

    const cancellationRate = rate90d;
    const badgeTier = stats?.badge_tier || 'green';
    const IconComponent = getIcon(badgeTier);

    const handleBadgeClick = () => {
      setDialogOpen(true);
    };

    // Always show badge, even for 0%
    return (
      <Dialog key={roleType} open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Badge 
            variant={getVariant(badgeTier)} 
            className={`${sizeClass} flex items-center gap-1 cursor-pointer`}
            title={`${getTitle(badgeTier)}: ${formatRate(cancellationRate)}% - Click for details`}
          >
            <IconComponent className="h-3 w-3" />
            {showPercentage && (
              <span>
                {formatRate(cancellationRate)}%
              </span>
            )}
          </Badge>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancellation Stats - {roleType === "rider" ? "Rider" : "Driver"}</DialogTitle>
            <DialogDescription>
              Detailed breakdown of cancellation history and reliability
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-muted">
              <h3 className="font-semibold mb-2">Overall Status</h3>
              <div className="flex items-center gap-2">
                <Badge variant={getVariant(badgeTier)} className="flex items-center gap-1">
                  <IconComponent className="h-4 w-4" />
                  {getTitle(badgeTier)}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">90-Day Rate</p>
                <p className="text-2xl font-bold">{formatRate(rate90d)}%</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {cancels90d} of {committed90d} trips
                </p>
              </div>

              <div className="p-3 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">Lifetime Rate</p>
                <p className="text-2xl font-bold">{formatRate(rateLifetime)}%</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {cancelsLifetime} of {committedLifetime} trips
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted">
              <h3 className="font-semibold mb-2">Chargeable Cancellations</h3>
              <p className="text-xl font-bold">{chargeableCancels}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Total number of cancellations that count against reliability
              </p>
            </div>

            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div className="text-xs text-muted-foreground">
                  <p className="mb-1">Cancellations are weighted based on timing:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Last-minute cancellations (within 2 hours) count more heavily</li>
                    <li>Cancellations with valid reasons may count less</li>
                    <li>Your 90-day rate determines your reliability badge</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <Button onClick={() => setDialogOpen(false)} className="w-full">
            Close
          </Button>
        </DialogContent>
      </Dialog>
    );
  };

  if (role === "both") {
    const riderBadge = renderBadge("rider");
    const driverBadge = renderBadge("driver");
    
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {riderBadge}
        {driverBadge}
      </div>
    );
  }

  return renderBadge(role);
}
