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
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from "recharts";

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

      // Fetch all page views for calculations
      const { data: allViews, error: allError } = await supabase
        .from("page_views")
        .select("id, created_at, user_id, path, page_label")
        .order("created_at", { ascending: false });

      if (allError) throw allError;

      if (!allViews) {
        setLoading(false);
        return;
      }

      // Calculate overview stats
      const totalViews = allViews.length;
      const viewsToday = allViews.filter(v => 
        v.created_at >= todayStart && v.created_at <= todayEnd
      ).length;
      const views7Days = allViews.filter(v => 
        v.created_at >= sevenDaysAgo
      ).length;
      const uniqueVisitors7Days = new Set(
        allViews
          .filter(v => v.created_at >= sevenDaysAgo && v.user_id)
          .map(v => v.user_id)
      ).size;

      setOverviewStats({
        totalViews,
        viewsToday,
        views7Days,
        uniqueVisitors7Days,
      });

      // Calculate page stats
      const pageMap = new Map<string, PageStats>();
      allViews.forEach(view => {
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

      // Calculate daily stats for chart (last 14 days)
      const dailyMap = new Map<string, number>();
      for (let i = 0; i < 14; i++) {
        const date = format(subDays(now, i), "yyyy-MM-dd");
        dailyMap.set(date, 0);
      }

      allViews
        .filter(v => v.created_at >= fourteenDaysAgo)
        .forEach(view => {
          const date = format(new Date(view.created_at), "yyyy-MM-dd");
          dailyMap.set(date, (dailyMap.get(date) || 0) + 1);
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
                    <TableCell className="text-right">{page.total_views}</TableCell>
                    <TableCell className="text-right">{page.views_today}</TableCell>
                    <TableCell className="text-right">{page.views_7_days}</TableCell>
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
