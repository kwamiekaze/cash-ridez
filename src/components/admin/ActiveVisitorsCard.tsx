import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, User, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface RecentVisit {
  id: string;
  created_at: string;
  user_id: string | null;
  full_name_snapshot: string | null;
  user_identifier_snapshot: string | null;
  verification_status_snapshot: string | null;
  is_subscribed: boolean;
  page_label: string;
}

interface ActiveVisitorsCardProps {
  onViewAll?: () => void;
}

export function ActiveVisitorsCard({ onViewAll }: ActiveVisitorsCardProps) {
  const [recentVisits, setRecentVisits] = useState<RecentVisit[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentVisits();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchRecentVisits, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchRecentVisits = async () => {
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      
      // Count active visitors (last 10 minutes)
      const { count } = await supabase
        .from("page_views")
        .select("user_id", { count: "exact", head: true })
        .gte("created_at", tenMinutesAgo)
        .not("user_id", "is", null);
      
      setActiveCount(count || 0);

      // Get last 5 visits
      const { data } = await supabase
        .from("page_views")
        .select("id, created_at, user_id, full_name_snapshot, user_identifier_snapshot, verification_status_snapshot, is_subscribed, page_label")
        .order("created_at", { ascending: false })
        .limit(5);

      setRecentVisits(data || []);
    } catch (error) {
      console.error("Error fetching recent visits:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-card/95 backdrop-blur">
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className="bg-card/95 backdrop-blur cursor-pointer hover:bg-card/90 transition-colors"
      onClick={onViewAll}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-green-500" />
            <CardTitle className="text-sm font-medium">Active Visitors</CardTitle>
          </div>
          <Badge variant="outline" className="text-green-400 border-green-500/30">
            {activeCount} in last 10 min
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {recentVisits.map((visit) => (
            <div key={visit.id} className="flex items-center gap-3 text-sm">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted flex-shrink-0">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium truncate">
                    {visit.full_name_snapshot || visit.user_identifier_snapshot?.slice(0, 8) || "Anonymous"}
                  </span>
                  {visit.verification_status_snapshot === "verified" && (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-1 py-0">
                      ✓
                    </Badge>
                  )}
                  {visit.is_subscribed && (
                    <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] px-1 py-0">
                      ★
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {visit.page_label} · {formatDistanceToNow(new Date(visit.created_at), { addSuffix: true })}
                </div>
              </div>
            </div>
          ))}
          {recentVisits.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-2">
              No recent visits
            </div>
          )}
        </div>
        {onViewAll && (
          <div className="flex items-center justify-center mt-3 pt-3 border-t text-xs text-muted-foreground">
            <span>View all activity</span>
            <ChevronRight className="h-3 w-3 ml-1" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
