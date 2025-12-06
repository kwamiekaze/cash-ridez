import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Users, Loader2, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { UserDetailDialog } from "./UserDetailDialog";

interface ReferrerStats {
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  email: string;
  photo_url: string | null;
  referral_code: string | null;
  total_referrals: number;
  verified_referrals: number;
  subscribed_referrals: number;
  first_referral_date: string | null;
  most_recent_referral_date: string | null;
}

export function AdminReferralsTab() {
  const [referrers, setReferrers] = useState<ReferrerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"total" | "recent">("total");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [referredUserDetails, setReferredUserDetails] = useState<Record<string, any[]>>({});

  useEffect(() => {
    fetchReferrerStats();
  }, []);

  const fetchReferrerStats = async () => {
    setLoading(true);
    try {
      // Get all referrals grouped by referrer
      const { data: referrals } = await supabase
        .from("referrals")
        .select(`
          referrer_user_id,
          referred_user_id,
          created_at
        `)
        .order("created_at", { ascending: false });

      if (!referrals || referrals.length === 0) {
        setReferrers([]);
        setLoading(false);
        return;
      }

      // Get unique referrer IDs
      const referrerIds = [...new Set(referrals.map(r => r.referrer_user_id))];
      const referredIds = referrals.map(r => r.referred_user_id);

      // Fetch referrer profiles
      const { data: referrerProfiles } = await supabase
        .from("profiles")
        .select("id, display_name, full_name, email, photo_url, referral_code")
        .in("id", referrerIds);

      // Fetch referred user profiles for verification/subscription status
      const { data: referredProfiles } = await supabase
        .from("profiles")
        .select("id, is_verified, subscription_active")
        .in("id", referredIds);

      // Build stats for each referrer
      const stats: ReferrerStats[] = referrerIds.map(referrerId => {
        const profile = referrerProfiles?.find(p => p.id === referrerId);
        const userReferrals = referrals.filter(r => r.referrer_user_id === referrerId);
        const referredUserIds = userReferrals.map(r => r.referred_user_id);
        const referredProfilesList = referredProfiles?.filter(p => referredUserIds.includes(p.id)) || [];

        return {
          user_id: referrerId,
          display_name: profile?.display_name || null,
          full_name: profile?.full_name || null,
          email: profile?.email || "Unknown",
          photo_url: profile?.photo_url || null,
          referral_code: profile?.referral_code || null,
          total_referrals: userReferrals.length,
          verified_referrals: referredProfilesList.filter(p => p.is_verified).length,
          subscribed_referrals: referredProfilesList.filter(p => p.subscription_active).length,
          first_referral_date: userReferrals.length > 0 
            ? userReferrals.reduce((min, r) => r.created_at < min ? r.created_at : min, userReferrals[0].created_at)
            : null,
          most_recent_referral_date: userReferrals.length > 0 
            ? userReferrals.reduce((max, r) => r.created_at > max ? r.created_at : max, userReferrals[0].created_at)
            : null,
        };
      });

      setReferrers(stats);
    } catch (error) {
      console.error("Error fetching referrer stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchReferredUsers = async (referrerId: string) => {
    if (referredUserDetails[referrerId]) return;

    const { data: referrals } = await supabase
      .from("referrals")
      .select("referred_user_id, created_at")
      .eq("referrer_user_id", referrerId)
      .order("created_at", { ascending: false });

    if (!referrals) return;

    const referredIds = referrals.map(r => r.referred_user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, full_name, email, photo_url, is_verified, subscription_active, created_at, completed_trips_count, is_rider, is_driver")
      .in("id", referredIds);

    if (profiles) {
      const mappedProfiles = profiles.map(p => ({
        ...p,
        completed_trips_count: p.completed_trips_count || 0,
        referral_date: referrals.find(r => r.referred_user_id === p.id)?.created_at
      }));
      setReferredUserDetails(prev => ({ ...prev, [referrerId]: mappedProfiles }));
    }
  };

  const toggleExpand = async (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
    } else {
      setExpandedUser(userId);
      await fetchReferredUsers(userId);
    }
  };

  const handleViewUser = (userId: string) => {
    setSelectedUserId(userId);
    setUserDialogOpen(true);
  };

  // Filter and sort referrers
  const filteredReferrers = referrers
    .filter(r => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        r.display_name?.toLowerCase().includes(query) ||
        r.full_name?.toLowerCase().includes(query) ||
        r.email?.toLowerCase().includes(query) ||
        r.referral_code?.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      if (sortBy === "total") {
        return sortOrder === "desc" 
          ? b.total_referrals - a.total_referrals 
          : a.total_referrals - b.total_referrals;
      } else {
        const dateA = a.most_recent_referral_date ? new Date(a.most_recent_referral_date).getTime() : 0;
        const dateB = b.most_recent_referral_date ? new Date(b.most_recent_referral_date).getTime() : 0;
        return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
      }
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-card/80">
          <p className="text-sm text-muted-foreground">Total Referrers</p>
          <p className="text-2xl font-bold text-primary">{referrers.length}</p>
        </Card>
        <Card className="p-4 bg-card/80">
          <p className="text-sm text-muted-foreground">Total Referrals</p>
          <p className="text-2xl font-bold text-primary">
            {referrers.reduce((sum, r) => sum + r.total_referrals, 0)}
          </p>
        </Card>
        <Card className="p-4 bg-card/80">
          <p className="text-sm text-muted-foreground">Verified Referrals</p>
          <p className="text-2xl font-bold text-green-500">
            {referrers.reduce((sum, r) => sum + r.verified_referrals, 0)}
          </p>
        </Card>
        <Card className="p-4 bg-card/80">
          <p className="text-sm text-muted-foreground">Subscribed Referrals</p>
          <p className="text-2xl font-bold text-yellow-500">
            {referrers.reduce((sum, r) => sum + r.subscribed_referrals, 0)}
          </p>
        </Card>
      </div>

      {/* Search and Sort */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or referral code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={sortBy === "total" ? "default" : "outline"}
            size="sm"
            onClick={() => setSortBy("total")}
          >
            By Count
          </Button>
          <Button
            variant={sortBy === "recent" ? "default" : "outline"}
            size="sm"
            onClick={() => setSortBy("recent")}
          >
            By Recent
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
          >
            {sortOrder === "desc" ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Referrers Table */}
      {filteredReferrers.length === 0 ? (
        <Card className="p-8 text-center">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">
            {searchQuery ? "No referrers match your search" : "No referrals in the system yet"}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Referrer</TableHead>
                <TableHead className="hidden md:table-cell">Referral Code</TableHead>
                <TableHead className="text-center">Total</TableHead>
                <TableHead className="text-center hidden sm:table-cell">Verified</TableHead>
                <TableHead className="text-center hidden sm:table-cell">Subscribed</TableHead>
                <TableHead className="hidden lg:table-cell">Most Recent</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReferrers.map((referrer) => (
                <>
                  <TableRow 
                    key={referrer.user_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleExpand(referrer.user_id)}
                  >
                    <TableCell>
                      {expandedUser === referrer.user_id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={referrer.photo_url || undefined} />
                          <AvatarFallback className="text-xs">
                            {(referrer.full_name || referrer.display_name || "U")[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">
                            {referrer.full_name || referrer.display_name || "User"}
                          </p>
                          <p className="text-xs text-muted-foreground hidden sm:block">
                            {referrer.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {referrer.referral_code || "N/A"}
                      </code>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{referrer.total_referrals}</Badge>
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell">
                      <Badge variant="outline" className="border-green-500 text-green-500">
                        {referrer.verified_referrals}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell">
                      <Badge variant="outline" className="border-yellow-500 text-yellow-500">
                        {referrer.subscribed_referrals}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {referrer.most_recent_referral_date 
                        ? format(new Date(referrer.most_recent_referral_date), "MMM d, yyyy")
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewUser(referrer.user_id);
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  
                  {/* Expanded Row - Referred Users */}
                  {expandedUser === referrer.user_id && (
                    <TableRow>
                      <TableCell colSpan={8} className="bg-muted/30 p-4">
                        <div className="space-y-2">
                          <p className="text-sm font-medium mb-3">Referred Users:</p>
                          {!referredUserDetails[referrer.user_id] ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm text-muted-foreground">Loading...</span>
                            </div>
                          ) : referredUserDetails[referrer.user_id].length === 0 ? (
                            <p className="text-sm text-muted-foreground">No referred users found</p>
                          ) : (
                            <div className="grid gap-2">
                              {referredUserDetails[referrer.user_id].map((referred: any) => (
                                <div 
                                  key={referred.id}
                                  className="flex items-center justify-between p-2 rounded bg-background/50"
                                >
                                  <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8">
                                      <AvatarImage src={referred.photo_url || undefined} />
                                      <AvatarFallback className="text-xs">
                                        {(referred.full_name || referred.display_name || "U")[0]?.toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="text-sm font-medium">
                                        {referred.full_name || referred.display_name || "User"}
                                      </p>
                                      <div className="flex items-center gap-2">
                                        <p className="text-xs text-muted-foreground">
                                          {referred.email}
                                        </p>
                                        <span className="text-xs text-primary font-medium">
                                          • {referred.completed_trips_count || 0} trips
                                        </span>
                                        {referred.is_rider && (
                                          <Badge variant="outline" className="text-xs py-0 h-4">Rider</Badge>
                                        )}
                                        {referred.is_driver && (
                                          <Badge variant="outline" className="text-xs py-0 h-4">Driver</Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {referred.is_verified && (
                                      <Badge variant="outline" className="border-green-500 text-green-500 text-xs">
                                        Verified
                                      </Badge>
                                    )}
                                    {referred.subscription_active && (
                                      <Badge variant="outline" className="border-yellow-500 text-yellow-500 text-xs">
                                        Premium
                                      </Badge>
                                    )}
                                    <span className="text-xs text-muted-foreground">
                                      {referred.referral_date 
                                        ? format(new Date(referred.referral_date), "MMM d, yyyy")
                                        : ""}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleViewUser(referred.id)}
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {selectedUserId && (
        <UserDetailDialog
          userId={selectedUserId}
          open={userDialogOpen}
          onOpenChange={setUserDialogOpen}
          onUpdate={fetchReferrerStats}
        />
      )}
    </div>
  );
}
