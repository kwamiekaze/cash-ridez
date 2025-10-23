import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, ExternalLink, CheckCircle } from "lucide-react";
import { format } from "date-fns";

interface SubscribedMember {
  id: string;
  full_name: string | null;
  display_name: string | null;
  email: string;
  active_role: string | null;
  is_member: boolean;
  subscription_status: string | null;
  subscription_current_period_end: number | null;
  stripe_subscription_id: string | null;
  created_at: string;
}

export const SubscribedMembersTab = () => {
  const [members, setMembers] = useState<SubscribedMember[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<SubscribedMember[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [filterExpiringSoon, setFilterExpiringSoon] = useState(false);

  useEffect(() => {
    fetchSubscribedMembers();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [searchQuery, members, filterExpiringSoon]);

  const fetchSubscribedMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, display_name, email, active_role, is_member, subscription_status, subscription_current_period_end, stripe_subscription_id, created_at')
        .eq('is_member', true)
        .order('subscription_current_period_end', { ascending: false });

      if (error) throw error;
      setMembers(data || []);
    } catch (error) {
      console.error('Error fetching subscribed members:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...members];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m => 
        m.full_name?.toLowerCase().includes(query) ||
        m.display_name?.toLowerCase().includes(query) ||
        m.email.toLowerCase().includes(query) ||
        m.stripe_subscription_id?.toLowerCase().includes(query)
      );
    }

    // Expiring soon filter (within 7 days)
    if (filterExpiringSoon) {
      const sevenDaysFromNow = Date.now() / 1000 + (7 * 24 * 60 * 60);
      filtered = filtered.filter(m => 
        m.subscription_current_period_end && 
        m.subscription_current_period_end <= sevenDaysFromNow &&
        m.subscription_current_period_end > Date.now() / 1000
      );
    }

    setFilteredMembers(filtered);
  };

  const getExpiryStatus = (periodEnd: number | null) => {
    if (!periodEnd) return null;
    
    const now = Date.now() / 1000;
    const daysUntilExpiry = (periodEnd - now) / (24 * 60 * 60);
    
    if (daysUntilExpiry < 0) {
      return { label: 'Expired', variant: 'destructive' as const };
    } else if (daysUntilExpiry <= 7) {
      return { label: 'Expires Soon', variant: 'secondary' as const };
    }
    return { label: 'Active', variant: 'default' as const };
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex justify-center">
          <p className="text-muted-foreground">Loading subscribed members...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or subscription ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant={filterExpiringSoon ? "default" : "outline"}
          onClick={() => setFilterExpiringSoon(!filterExpiringSoon)}
        >
          {filterExpiringSoon ? '✓ ' : ''}Expiring ≤7 days
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {filteredMembers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {searchQuery || filterExpiringSoon 
                ? "No members match your filters" 
                : "No active subscriptions found"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Current Period End</TableHead>
                    <TableHead>Stripe ID</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMembers.map((member) => {
                    const expiryStatus = getExpiryStatus(member.subscription_current_period_end);
                    return (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {member.full_name || member.display_name || 'Unknown'}
                            <CheckCircle className="h-4 w-4 text-primary fill-primary" />
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{member.email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {member.active_role || 'N/A'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={member.is_member ? "default" : "secondary"}>
                            {member.is_member ? 'Member' : 'No'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {member.subscription_current_period_end ? (
                              <>
                                <span className="text-sm">
                                  {format(new Date(member.subscription_current_period_end * 1000), 'MMM d, yyyy')}
                                </span>
                                {expiryStatus && (
                                  <Badge variant={expiryStatus.variant} className="text-xs w-fit">
                                    {expiryStatus.label}
                                  </Badge>
                                )}
                              </>
                            ) : (
                              <span className="text-sm text-muted-foreground">N/A</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {member.stripe_subscription_id ? (
                            <a 
                              href={`https://dashboard.stripe.com/subscriptions/${member.stripe_subscription_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              {member.stripe_subscription_id.slice(0, 12)}...
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(member.created_at), 'MMM d, yyyy')}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        Showing {filteredMembers.length} of {members.length} active subscriptions
      </div>
    </div>
  );
};
