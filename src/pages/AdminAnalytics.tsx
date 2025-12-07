import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Car, Activity, CheckCircle, Eye, UserCheck } from "lucide-react";
import { MapBackground } from "@/components/MapBackground";
import { PageViewsAnalytics } from "@/components/admin/PageViewsAnalytics";
import { VisitorActivityLog } from "@/components/admin/VisitorActivityLog";
import { ActiveVisitorsCard } from "@/components/admin/ActiveVisitorsCard";

interface AnalyticsStats {
  totalUsers: number;
  verifiedUsers: number;
  totalTrips: number;
  completedTrips: number;
  activeTrips: number;
  cancelledTrips: number;
  totalDrivers: number;
  totalRiders: number;
  avgRating: number;
}

export default function AdminAnalytics() {
  const [stats, setStats] = useState<AnalyticsStats>({
    totalUsers: 0,
    verifiedUsers: 0,
    totalTrips: 0,
    completedTrips: 0,
    activeTrips: 0,
    cancelledTrips: 0,
    totalDrivers: 0,
    totalRiders: 0,
    avgRating: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      // Fetch user stats
      const { data: users } = await supabase
        .from("profiles")
        .select("is_verified, is_driver, is_rider, rider_rating_avg, driver_rating_avg");

      const totalUsers = users?.length || 0;
      const verifiedUsers = users?.filter(u => u.is_verified).length || 0;
      const totalDrivers = users?.filter(u => u.is_driver).length || 0;
      const totalRiders = users?.filter(u => u.is_rider).length || 0;

      // Calculate average rating
      const allRatings = users?.flatMap(u => [u.rider_rating_avg, u.driver_rating_avg]).filter(r => r > 0) || [];
      const avgRating = allRatings.length > 0 
        ? allRatings.reduce((sum, r) => sum + r, 0) / allRatings.length 
        : 0;

      // Fetch trip stats
      const { data: trips } = await supabase
        .from("ride_requests")
        .select("status");

      const totalTrips = trips?.length || 0;
      const completedTrips = trips?.filter(t => t.status === "completed").length || 0;
      const activeTrips = trips?.filter(t => t.status === "assigned").length || 0;
      const cancelledTrips = trips?.filter(t => t.status === "cancelled").length || 0;

      setStats({
        totalUsers,
        verifiedUsers,
        totalTrips,
        completedTrips,
        activeTrips,
        cancelledTrips,
        totalDrivers,
        totalRiders,
        avgRating,
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: "Total Users",
      value: stats.totalUsers,
      icon: Users,
      description: `${stats.verifiedUsers} verified`,
      color: "text-blue-500",
    },
    {
      title: "Total Drivers",
      value: stats.totalDrivers,
      icon: Car,
      description: "Active drivers",
      color: "text-green-500",
    },
    {
      title: "Total Riders",
      value: stats.totalRiders,
      icon: Users,
      description: "Active riders",
      color: "text-purple-500",
    },
    {
      title: "Total Trips",
      value: stats.totalTrips,
      icon: Activity,
      description: `${stats.completedTrips} completed`,
      color: "text-yellow-500",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 bg-card/50 backdrop-blur-sm border border-border/50">
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Activity className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="traffic" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Eye className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Page Views</span>
          </TabsTrigger>
          <TabsTrigger value="visitors" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <UserCheck className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Visitor Activity</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Active Visitors Card */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <ActiveVisitorsCard onViewAll={() => setActiveTab("visitors")} />
            </div>
            <div className="md:col-span-2 grid gap-4 grid-cols-2">
              {statCards.slice(0, 4).map((stat) => (
                <Card key={stat.title} className="bg-card/95 backdrop-blur">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {stat.title}
                    </CardTitle>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {stat.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="bg-card/95 backdrop-blur">
              <CardHeader>
                <CardTitle>Trip Statistics</CardTitle>
                <CardDescription>Breakdown of all trips</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Completed</span>
                  <span className="font-semibold text-green-500">{stats.completedTrips}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Active</span>
                  <span className="font-semibold text-blue-500">{stats.activeTrips}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Cancelled</span>
                  <span className="font-semibold text-red-500">{stats.cancelledTrips}</span>
                </div>
                <div className="flex justify-between items-center pt-4 border-t">
                  <span className="text-sm font-medium">Completion Rate</span>
                  <span className="font-bold text-lg">
                    {stats.totalTrips > 0 
                      ? ((stats.completedTrips / stats.totalTrips) * 100).toFixed(1) 
                      : 0}%
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/95 backdrop-blur">
              <CardHeader>
                <CardTitle>User Overview</CardTitle>
                <CardDescription>User engagement metrics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Drivers</span>
                  <span className="font-semibold">{stats.totalDrivers}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Riders</span>
                  <span className="font-semibold">{stats.totalRiders}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Verified Users</span>
                  <span className="font-semibold text-green-500">{stats.verifiedUsers}</span>
                </div>
                <div className="flex justify-between items-center pt-4 border-t">
                  <span className="text-sm font-medium">Verification Rate</span>
                  <span className="font-bold text-lg">
                    {stats.totalUsers > 0 
                      ? ((stats.verifiedUsers / stats.totalUsers) * 100).toFixed(1) 
                      : 0}%
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="traffic" className="mt-6">
          <PageViewsAnalytics />
        </TabsContent>

        <TabsContent value="visitors" className="mt-6">
          <VisitorActivityLog />
        </TabsContent>
      </Tabs>
    </div>
  );
}
