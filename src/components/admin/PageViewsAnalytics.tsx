import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, Users, TrendingUp, Calendar } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis } from "recharts";

interface PageStats {
  page_label: string;
  path: string;
  total_views: number;
  views_today: number;
  views_7_days: number;
}

interface DailyStats {
  date: string;
  views: number;
}

interface OverviewStats {
  totalViews: number;
  viewsToday: number;
  views7Days: number;
  uniqueVisitors7Days: number;
}

export function PageViewsAnalytics() {
  const [overviewStats, setOverviewStats] = useState<OverviewStats>({
    totalViews: 0,
    viewsToday: 0,
    views7Days: 0,
    uniqueVisitors7Days: 0,
  });
  const [pageStats, setPageStats] = useState<PageStats[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const now = new Date();
      const todayStart = startOfDay(now).toISOString();
      const todayEnd = endOfDay(now).toISOString();
      const sevenDaysAgo = subDays(now, 7).toISOString();
      const fourteenDaysAgo = subDays(now, 14).toISOString();

      // Use COUNT queries instead of fetching all rows (avoids 1000 row limit)
      // Total views - count all records
      const { count: totalViews, error: totalError } = await supabase
        .from("page_views")
        .select("*", { count: "exact", head: true });

      if (totalError) throw totalError;

      // Views today - count with date filter
      const { count: viewsToday, error: todayError } = await supabase
        .from("page_views")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd);

      if (todayError) throw todayError;

      // Views last 7 days - count with date filter
      const { count: views7Days, error: weekError } = await supabase
        .from("page_views")
        .select("*", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo);

      if (weekError) throw weekError;

      // Unique visitors last 7 days - fetch distinct user_ids only
      const { data: uniqueUsers, error: uniqueError } = await supabase
        .from("page_views")
        .select("user_id")
        .gte("created_at", sevenDaysAgo)
        .not("user_id", "is", null);

      if (uniqueError) throw uniqueError;

      const uniqueVisitors7Days = new Set(uniqueUsers?.map(u => u.user_id)).size;

      setOverviewStats({
        totalViews: totalViews || 0,
        viewsToday: viewsToday || 0,
        views7Days: views7Days || 0,
        uniqueVisitors7Days,
      });

      // Fetch page stats using aggregation approach
      // First get all unique paths with counts
      const { data: allPaths, error: pathsError } = await supabase
        .from("page_views")
        .select("path, page_label, created_at");

      if (pathsError) throw pathsError;

      // If we hit the 1000 limit, we need a different approach for page stats
      // Use RPC or paginated fetching for accurate per-page counts
      if (allPaths && allPaths.length >= 1000) {
        // Fetch unique paths first
        const uniquePaths = [...new Set(allPaths.map(p => p.path))];
        
        // For each path, get accurate counts using COUNT queries
        const pageStatsPromises = uniquePaths.map(async (path) => {
          const [totalResult, todayResult, weekResult] = await Promise.all([
            supabase
              .from("page_views")
              .select("*", { count: "exact", head: true })
              .eq("path", path),
            supabase
              .from("page_views")
              .select("*", { count: "exact", head: true })
              .eq("path", path)
              .gte("created_at", todayStart)
              .lte("created_at", todayEnd),
            supabase
              .from("page_views")
              .select("*", { count: "exact", head: true })
              .eq("path", path)
              .gte("created_at", sevenDaysAgo),
          ]);

          const pageLabel = allPaths.find(p => p.path === path)?.page_label || path;

          return {
            path,
            page_label: pageLabel,
            total_views: totalResult.count || 0,
            views_today: todayResult.count || 0,
            views_7_days: weekResult.count || 0,
          };
        });

        const resolvedPageStats = await Promise.all(pageStatsPromises);
        const sortedPageStats = resolvedPageStats.sort((a, b) => b.total_views - a.total_views);
        setPageStats(sortedPageStats);
      } else if (allPaths) {
        // Under 1000 records - original client-side aggregation is fine
        const pageMap = new Map<string, PageStats>();
        allPaths.forEach(view => {
          const key = view.path;
          const existing = pageMap.get(key) || {
            page_label: view.page_label,
            path: view.path,
            total_views: 0,
            views_today: 0,
            views_7_days: 0,
          };
          
          existing.total_views++;
          if (view.created_at >= todayStart && view.created_at <= todayEnd) {
            existing.views_today++;
          }
          if (view.created_at >= sevenDaysAgo) {
            existing.views_7_days++;
          }
          
          pageMap.set(key, existing);
        });

        const sortedPageStats = Array.from(pageMap.values())
          .sort((a, b) => b.total_views - a.total_views);
        setPageStats(sortedPageStats);
      }

      // Calculate daily stats for chart (last 14 days)
      // Fetch with date filter to stay under 1000 limit for recent data
      const { data: recentViews, error: recentError } = await supabase
        .from("page_views")
        .select("created_at")
        .gte("created_at", fourteenDaysAgo);

      if (recentError) throw recentError;

      const dailyMap = new Map<string, number>();
      for (let i = 0; i < 14; i++) {
        const date = format(subDays(now, i), "yyyy-MM-dd");
        dailyMap.set(date, 0);
      }

      recentViews?.forEach(view => {
        const date = format(new Date(view.created_at), "yyyy-MM-dd");
        if (dailyMap.has(date)) {
          dailyMap.set(date, (dailyMap.get(date) || 0) + 1);
        }
      });

      const chartData = Array.from(dailyMap.entries())
        .map(([date, views]) => ({ date, views }))
        .sort((a, b) => a.date.localeCompare(b.date));
      
      setDailyStats(chartData);
    } catch (error) {
      console.error("Error fetching page analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const chartConfig = {
    views: {
      label: "Page Views",
      color: "hsl(var(--primary))",
    },
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/95 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Page Views
            </CardTitle>
            <Eye className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overviewStats.totalViews.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card className="bg-card/95 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Views Today
            </CardTitle>
            <Calendar className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overviewStats.viewsToday.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Since midnight</p>
          </CardContent>
        </Card>

        <Card className="bg-card/95 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Views Last 7 Days
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overviewStats.views7Days.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Past week</p>
          </CardContent>
        </Card>

        <Card className="bg-card/95 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unique Visitors (7d)
            </CardTitle>
            <Users className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overviewStats.uniqueVisitors7Days.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Logged-in users</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Trend Chart */}
      <Card className="bg-card/95 backdrop-blur">
        <CardHeader>
          <CardTitle>Daily Page Views</CardTitle>
          <CardDescription>Traffic trend over the last 14 days</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <AreaChart data={dailyStats}>
              <defs>
                <linearGradient id="fillViews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => format(new Date(value), "MMM d")}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis 
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <ChartTooltip 
                content={<ChartTooltipContent />}
                labelFormatter={(value) => format(new Date(value), "MMM d, yyyy")}
              />
              <Area
                type="monotone"
                dataKey="views"
                stroke="hsl(var(--primary))"
                fillOpacity={1}
                fill="url(#fillViews)"
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Page Views Table */}
      <Card className="bg-card/95 backdrop-blur">
        <CardHeader>
          <CardTitle>Views by Page</CardTitle>
          <CardDescription>Traffic breakdown by page</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead className="hidden sm:table-cell">Path</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Today</TableHead>
                  <TableHead className="text-right">7 Days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageStats.map((page) => (
                  <TableRow key={page.path}>
                    <TableCell className="font-medium">{page.page_label}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                      {page.path}
                    </TableCell>
                    <TableCell className="text-right">{page.total_views.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{page.views_today.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{page.views_7_days.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {pageStats.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No page views recorded yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
