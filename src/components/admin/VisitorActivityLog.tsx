import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ChevronLeft, ChevronRight, User, ExternalLink } from "lucide-react";
import { format, subDays, formatDistanceToNow } from "date-fns";
import { UserDetailDialog } from "@/components/UserDetailDialog";

interface PageView {
  id: string;
  created_at: string;
  user_id: string | null;
  full_name_snapshot: string | null;
  user_identifier_snapshot: string | null;
  email_snapshot: string | null;
  verification_status_snapshot: string | null;
  is_subscribed: boolean;
  subscription_status_snapshot: string | null;
  role_snapshot: string | null;
  path: string;
  page_label: string;
  device_type: string | null;
}

const ITEMS_PER_PAGE = 50;

export function VisitorActivityLog() {
  const [pageViews, setPageViews] = useState<PageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("7");
  const [verificationFilter, setVerificationFilter] = useState<string>("all");
  const [subscriptionFilter, setSubscriptionFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);

  const fetchPageViews = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("page_views")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      // Apply date filter
      if (dateFilter !== "all") {
        const daysAgo = parseInt(dateFilter);
        const startDate = subDays(new Date(), daysAgo).toISOString();
        query = query.gte("created_at", startDate);
      }

      // Apply verification filter
      if (verificationFilter !== "all") {
        query = query.eq("verification_status_snapshot", verificationFilter);
      }

      // Apply subscription filter
      if (subscriptionFilter === "subscribed") {
        query = query.eq("is_subscribed", true);
      } else if (subscriptionFilter === "not_subscribed") {
        query = query.eq("is_subscribed", false);
      }

      // Apply role filter
      if (roleFilter !== "all") {
        query = query.eq("role_snapshot", roleFilter);
      }

      // Apply search filter
      if (searchQuery.trim()) {
        query = query.or(
          `full_name_snapshot.ilike.%${searchQuery}%,email_snapshot.ilike.%${searchQuery}%,user_identifier_snapshot.ilike.%${searchQuery}%`
        );
      }

      // Pagination
      const from = page * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) throw error;

      setPageViews(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error("Error fetching page views:", error);
    } finally {
      setLoading(false);
    }
  }, [page, dateFilter, verificationFilter, subscriptionFilter, roleFilter, searchQuery]);

  useEffect(() => {
    fetchPageViews();
  }, [fetchPageViews]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [dateFilter, verificationFilter, subscriptionFilter, roleFilter, searchQuery]);

  const handleViewUser = (userId: string) => {
    setSelectedUserId(userId);
    setUserDialogOpen(true);
  };

  const getVerificationBadge = (status: string | null) => {
    switch (status) {
      case "verified":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Verified</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pending</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">Not Verified</Badge>;
    }
  };

  const getRoleBadge = (role: string | null) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Admin</Badge>;
      case "driver":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Driver</Badge>;
      case "rider":
        return <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">Rider</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">Unknown</Badge>;
    }
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="bg-card/95 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            {/* Search */}
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Date Filter */}
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Today</SelectItem>
                <SelectItem value="7">Last 7 Days</SelectItem>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>

            {/* Verification Filter */}
            <Select value={verificationFilter} onValueChange={setVerificationFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Verification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="unverified">Not Verified</SelectItem>
              </SelectContent>
            </Select>

            {/* Subscription Filter */}
            <Select value={subscriptionFilter} onValueChange={setSubscriptionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Subscription" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="subscribed">Subscribed</SelectItem>
                <SelectItem value="not_subscribed">Not Subscribed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Visitor Log Table */}
      <Card className="bg-card/95 backdrop-blur">
        <CardHeader>
          <CardTitle>Visitor Activity Log</CardTitle>
          <CardDescription>
            {totalCount.toLocaleString()} total visits
            {dateFilter !== "all" && ` in the last ${dateFilter} day${dateFilter === "1" ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Visitor</TableHead>
                      <TableHead className="hidden md:table-cell">Verification</TableHead>
                      <TableHead className="hidden lg:table-cell">Subscription</TableHead>
                      <TableHead className="hidden sm:table-cell">Role</TableHead>
                      <TableHead>Page</TableHead>
                      <TableHead className="text-right">Visited</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageViews.map((view) => (
                      <TableRow 
                        key={view.id}
                        className={view.user_id ? "cursor-pointer hover:bg-muted/50" : ""}
                        onClick={() => view.user_id && handleViewUser(view.user_id)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                              <User className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium truncate max-w-[150px] sm:max-w-[200px]">
                                {view.full_name_snapshot || view.user_identifier_snapshot?.slice(0, 8) || "Anonymous"}
                              </div>
                              {view.email_snapshot && (
                                <div className="text-xs text-muted-foreground truncate max-w-[150px] sm:max-w-[200px]">
                                  {view.email_snapshot}
                                </div>
                              )}
                            </div>
                            {view.user_id && (
                              <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {getVerificationBadge(view.verification_status_snapshot)}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {view.is_subscribed ? (
                            <Badge className="bg-primary/20 text-primary border-primary/30">Subscribed</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">Free</Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {getRoleBadge(view.role_snapshot)}
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <div className="font-medium text-sm">{view.page_label}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[100px]">
                              {view.path}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <div className="text-sm">
                            {formatDistanceToNow(new Date(view.created_at), { addSuffix: true })}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(view.created_at), "MMM d, h:mm a")}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {pageViews.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No visits found matching your filters
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {page * ITEMS_PER_PAGE + 1} - {Math.min((page + 1) * ITEMS_PER_PAGE, totalCount)} of {totalCount}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* User Detail Dialog */}
      {selectedUserId && (
        <UserDetailDialog
          userId={selectedUserId}
          open={userDialogOpen}
          onOpenChange={setUserDialogOpen}
          onUpdate={() => {}}
        />
      )}
    </div>
  );
}
