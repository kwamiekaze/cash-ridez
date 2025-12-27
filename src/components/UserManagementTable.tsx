import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, Eye, ExternalLink, Pause, Play, Lock, Unlock, ShieldX } from "lucide-react";
import { UserChip } from "@/components/UserChip";
import { AdminUserFilters, UserFilters } from "@/components/admin/AdminUserFilters";
import { AdminBlockUserDialog } from "@/components/AdminBlockUserDialog";

interface User {
  id: string;
  email: string;
  display_name: string;
  is_verified: boolean;
  is_rider: boolean;
  is_driver: boolean;
  verification_status: string;
  rider_rating_avg: number;
  driver_rating_avg: number;
  photo_url: string;
  id_image_url: string;
  paused: boolean;
  blocked: boolean;
  admin_locked_fields: string[] | null;
  full_name: string | null;
  created_at: string | null;
  verification_reviewed_at: string | null;
  verification_submitted_at?: string | null;
}

interface UserWithActivity extends User {
  lastVisit?: Date | null;
  isAdmin?: boolean;
}

interface UserManagementTableProps {
  users: User[];
  onUpdate: () => void;
  onViewUser: (userId: string) => void;
  showFilters?: boolean;
}

export function UserManagementTable({ users, onUpdate, onViewUser, showFilters = true }: UserManagementTableProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [filters, setFilters] = useState<UserFilters>({
    roles: [],
    verificationStatus: "all",
    lastVisit: "all",
    blockedStatus: "not_blocked",
  });
  const [filteredUsers, setFilteredUsers] = useState<UserWithActivity[]>(users);
  const [userActivity, setUserActivity] = useState<Record<string, Date | null>>({});
  const [adminUsers, setAdminUsers] = useState<Set<string>>(new Set());
  const [blockDialogUser, setBlockDialogUser] = useState<{ id: string; name: string } | null>(null);

  // Fetch last visit data and admin status
  useEffect(() => {
    const fetchActivityAndRoles = async () => {
      // Fetch latest page view per user
      const { data: pageViews } = await supabase
        .from("page_views")
        .select("user_id, created_at")
        .not("user_id", "is", null)
        .order("created_at", { ascending: false });

      if (pageViews) {
        const activityMap: Record<string, Date | null> = {};
        pageViews.forEach(pv => {
          if (pv.user_id && !activityMap[pv.user_id]) {
            activityMap[pv.user_id] = new Date(pv.created_at);
          }
        });
        setUserActivity(activityMap);
      }

      // Fetch admin roles
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (adminRoles) {
        setAdminUsers(new Set(adminRoles.map(r => r.user_id)));
      }
    };

    fetchActivityAndRoles();
  }, [users]);

  // Apply filters
  useEffect(() => {
    let filtered: UserWithActivity[] = users.map(u => ({
      ...u,
      lastVisit: userActivity[u.id] || null,
      isAdmin: adminUsers.has(u.id),
    }));
    
    // Role filter (multi-select)
    if (filters.roles.length > 0) {
      filtered = filtered.filter(u => {
        return filters.roles.some(role => {
          if (role === "driver") return u.is_driver && !u.is_rider;
          if (role === "rider") return u.is_rider && !u.is_driver;
          if (role === "both") return u.is_driver && u.is_rider;
          if (role === "admin") return u.isAdmin;
          return false;
        });
      });
    }

    // Verification status filter
    if (filters.verificationStatus !== "all") {
      filtered = filtered.filter(u => {
        switch (filters.verificationStatus) {
          case "verified":
            return u.is_verified;
          case "pending":
            return !u.is_verified && u.verification_status === "pending";
          case "rejected":
            return !u.is_verified && u.verification_status === "rejected";
          case "not_submitted":
            return !u.is_verified && (!u.verification_status || u.verification_status === "pending") && !u.verification_submitted_at;
          default:
            return true;
        }
      });
    }

    // Last visit filter
    if (filters.lastVisit !== "all") {
      const now = new Date();
      filtered = filtered.filter(u => {
        const lastVisit = u.lastVisit;
        switch (filters.lastVisit) {
          case "online_now":
            return lastVisit && (now.getTime() - lastVisit.getTime()) <= 5 * 60 * 1000; // 5 min
          case "24h":
            return lastVisit && (now.getTime() - lastVisit.getTime()) <= 24 * 60 * 60 * 1000;
          case "7d":
            return lastVisit && (now.getTime() - lastVisit.getTime()) <= 7 * 24 * 60 * 60 * 1000;
          case "30d":
            return lastVisit && (now.getTime() - lastVisit.getTime()) <= 30 * 24 * 60 * 60 * 1000;
          case "never":
            return !lastVisit;
          default:
            return true;
        }
      });
    }

    // Blocked status filter
    if (filters.blockedStatus !== "all") {
      filtered = filtered.filter(u => {
        switch (filters.blockedStatus) {
          case "blocked":
            return u.blocked === true;
          case "not_blocked":
            return u.blocked !== true;
          default:
            return true;
        }
      });
    }
    
    // Sort by created_at desc by default
    filtered.sort((a, b) => {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
    
    setFilteredUsers(filtered);
  }, [users, filters, userActivity, adminUsers]);

  const handleVerificationToggle = async (userId: string, currentStatus: boolean) => {
    setLoading(userId);
    try {
      // Get user details first
      const user = users.find(u => u.id === userId);
      if (!user) throw new Error("User not found");

      const { error } = await supabase
        .from("profiles")
        .update({
          is_verified: !currentStatus,
          verification_status: !currentStatus ? "approved" : "pending",
        })
        .eq("id", userId);

      if (error) throw error;

      // Send email notification for approval
      if (!currentStatus) {
        try {
          await supabase.functions.invoke("send-status-notification", {
            body: {
              userEmail: user.email,
              displayName: user.display_name || user.email,
              status: "approved",
            },
          });
        } catch (emailError) {
          console.error("Error sending notification email:", emailError);
        }
      }

      toast.success(`User ${!currentStatus ? "verified" : "unverified"} successfully`);
      onUpdate();
    } catch (error: any) {
      toast.error("Failed to update verification status");
      console.error(error);
    } finally {
      setLoading(null);
    }
  };

  const handleRejectVerification = async (userId: string) => {
    setLoading(userId);
    try {
      const user = users.find(u => u.id === userId);
      if (!user) throw new Error("User not found");

      const { error } = await supabase
        .from("profiles")
        .update({
          is_verified: false,
          verification_status: "rejected",
        })
        .eq("id", userId);

      if (error) throw error;

      // Send rejection notification email
      try {
        await supabase.functions.invoke("send-status-notification", {
          body: {
            userEmail: user.email,
            displayName: user.display_name || user.email,
            status: "rejected",
          },
        });
      } catch (emailError) {
        console.error("Error sending notification email:", emailError);
      }

      toast.success("Verification rejected - user notified to resubmit");
      onUpdate();
    } catch (error: any) {
      toast.error("Failed to reject verification");
      console.error(error);
    } finally {
      setLoading(null);
    }
  };

  const handlePauseToggle = async (userId: string, currentStatus: boolean) => {
    setLoading(userId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          paused: !currentStatus,
        })
        .eq("id", userId);

      if (error) throw error;

      toast.success(`Account ${!currentStatus ? "paused" : "unpaused"} successfully`);
      onUpdate();
    } catch (error: any) {
      toast.error("Failed to update account status");
      console.error(error);
    } finally {
      setLoading(null);
    }
  };

  const handleViewIdImage = async (idImagePath: string) => {
    try {
      // idImagePath is now the file path directly (not a URL)
      const { data, error } = await supabase.storage
        .from('id-verifications')
        .createSignedUrl(idImagePath, 3600); // 1 hour expiry
      
      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error) {
      console.error('Error opening ID image:', error);
      toast.error('Failed to open ID image');
    }
  };

  const handleLockNameToggle = async (userId: string, currentLockedFields: string[] | null) => {
    setLoading(userId);
    try {
      const lockedFields = currentLockedFields || [];
      const isCurrentlyLocked = lockedFields.includes('full_name');
      
      const newLockedFields = isCurrentlyLocked
        ? lockedFields.filter(field => field !== 'full_name')
        : [...lockedFields, 'full_name'];

      const { error } = await supabase
        .from('profiles')
        .update({ admin_locked_fields: newLockedFields })
        .eq('id', userId);

      if (error) throw error;

      toast.success(`Full name ${isCurrentlyLocked ? 'unlocked' : 'locked'} successfully`);
      onUpdate();
    } catch (error: any) {
      console.error('Error toggling name lock:', error);
      toast.error(error.message || 'Failed to update lock status');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {showFilters && (
        <AdminUserFilters filters={filters} onFiltersChange={setFilters} />
      )}
      
      {filteredUsers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground bg-card/50 backdrop-blur-sm rounded-lg border border-border/50">
          <p>No users match the current filters</p>
        </div>
      ) : (
      <div className="rounded-md border overflow-hidden bg-card/50 backdrop-blur-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead className="text-white font-semibold w-[140px] sm:w-[180px] sticky left-0 bg-card/95 backdrop-blur-sm z-10">User</TableHead>
              <TableHead className="text-white font-semibold w-[180px] hidden md:table-cell">Email</TableHead>
              <TableHead className="text-white font-semibold w-[90px]">Status</TableHead>
              <TableHead className="text-white font-semibold w-auto">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.id} className="cursor-pointer hover:bg-muted/50 border-border/30" onClick={() => onViewUser(user.id)}>
                <TableCell className="sticky left-0 bg-card/95 backdrop-blur-sm z-10 w-[140px] sm:w-[180px]">
                  <UserChip 
                    userId={user.id}
                    displayName={user.display_name}
                    fullName={user.full_name || undefined}
                    photoUrl={user.photo_url}
                    size="sm"
                    showCancellationBadge={false}
                  />
                </TableCell>
                <TableCell className="font-medium text-white text-xs sm:text-sm w-[180px] hidden md:table-cell">
                  <div className="truncate max-w-[180px]" title={user.email}>{user.email}</div>
                </TableCell>
                <TableCell className="w-[90px]">
                  <div className="flex flex-col gap-1">
                    {user.blocked ? (
                      <Badge variant="destructive" className="text-xs whitespace-nowrap">Blocked</Badge>
                    ) : user.is_verified ? (
                      <Badge className="bg-green-500 text-white text-xs whitespace-nowrap">Verified</Badge>
                    ) : user.verification_status === "rejected" ? (
                      <Badge variant="destructive" className="text-xs whitespace-nowrap">Rejected</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs whitespace-nowrap">Pending</Badge>
                    )}
                    {user.paused && !user.blocked && <Badge variant="secondary" className="text-xs whitespace-nowrap mt-1">Paused</Badge>}
                  </div>
                </TableCell>
                <TableCell className="w-auto">
                  <div className="flex gap-1 flex-wrap justify-end sm:justify-start" onClick={(e) => e.stopPropagation()}>
                    {!user.is_verified && user.verification_status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleVerificationToggle(user.id, user.is_verified)}
                          disabled={loading === user.id}
                          title="Approve"
                          className="h-8 w-8 p-0 sm:w-auto sm:px-3"
                        >
                          <Check className="h-3 w-3 sm:mr-1" />
                          <span className="hidden sm:inline text-xs">Approve</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRejectVerification(user.id)}
                          disabled={loading === user.id}
                          title="Reject"
                          className="h-8 w-8 p-0 sm:w-auto sm:px-3"
                        >
                          <X className="h-3 w-3 sm:mr-1" />
                          <span className="hidden sm:inline text-xs">Reject</span>
                        </Button>
                      </>
                    )}
                    {user.is_verified && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleVerificationToggle(user.id, user.is_verified)}
                        disabled={loading === user.id}
                        title="Unverify"
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={user.paused ? "default" : "outline"}
                      onClick={() => handlePauseToggle(user.id, user.paused)}
                      disabled={loading === user.id}
                      title={user.paused ? "Unpause" : "Pause"}
                      className="h-8 w-8 p-0"
                    >
                      {user.paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                    </Button>
                    {user.id_image_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewIdImage(user.id_image_url)}
                        className="h-8 w-8 p-0"
                        title="View ID"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onViewUser(user.id)}
                      className="h-8 w-8 p-0"
                      title="View User"
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleLockNameToggle(user.id, user.admin_locked_fields)}
                      disabled={loading === user.id || !user.full_name}
                      title={user.admin_locked_fields?.includes('full_name') ? "Unlock" : "Lock"}
                      className="h-8 w-8 p-0"
                    >
                      {user.admin_locked_fields?.includes('full_name') ? (
                        <Lock className="h-3 w-3 text-destructive" />
                      ) : (
                        <Unlock className="h-3 w-3" />
                      )}
                    </Button>
                    {!user.blocked && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setBlockDialogUser({ id: user.id, name: user.display_name || user.full_name || user.email })}
                        disabled={loading === user.id}
                        title="Block User"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <ShieldX className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}

      {/* Block User Dialog */}
      {blockDialogUser && (
        <AdminBlockUserDialog
          userId={blockDialogUser.id}
          userName={blockDialogUser.name}
          open={!!blockDialogUser}
          onOpenChange={(open) => !open && setBlockDialogUser(null)}
          onSuccess={onUpdate}
        />
      )}
    </div>
  );
}
