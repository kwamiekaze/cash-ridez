import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, Eye, ExternalLink, Pause, Play, Lock, Unlock, ShieldX, MessageSquare, ChevronLeft, ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AdminUserFilters, UserFilters } from "@/components/admin/AdminUserFilters";
import { AdminBlockUserDialog } from "@/components/AdminBlockUserDialog";
import { RejectVerificationDialog } from "@/components/RejectVerificationDialog";
import { DirectMessageDialog } from "@/components/DirectMessageDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const [rejectDialogUser, setRejectDialogUser] = useState<{ id: string; name: string } | null>(null);
  const [messageDialogUserId, setMessageDialogUserId] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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
    setCurrentPage(1); // Reset to first page when filters change
  }, [users, filters, userActivity, adminUsers]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredUsers.length / pageSize);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

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

  const handleRejectVerification = async (userId: string, reason: string) => {
    setLoading(userId);
    try {
      const user = users.find(u => u.id === userId);
      if (!user) throw new Error("User not found");

      const { error } = await supabase
        .from("profiles")
        .update({
          is_verified: false,
          verification_status: "rejected",
          verification_notes: reason,
        })
        .eq("id", userId);

      if (error) throw error;

      // Send rejection notification email with reason
      try {
        await supabase.functions.invoke("send-status-notification", {
          body: {
            userEmail: user.email,
            displayName: user.display_name || user.email,
            status: "rejected",
            reason: reason,
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

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email[0]?.toUpperCase() || '?';
  };

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      {showFilters && (
        <AdminUserFilters filters={filters} onFiltersChange={setFilters} />
      )}
      
      {/* Pagination controls - top */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Show</span>
          <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
            <SelectTrigger className="w-[70px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">per page</span>
        </div>
        <div className="text-sm text-muted-foreground">
          Showing {Math.min((currentPage - 1) * pageSize + 1, filteredUsers.length)} - {Math.min(currentPage * pageSize, filteredUsers.length)} of {filteredUsers.length} users
        </div>
      </div>
      
      {filteredUsers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground bg-card/50 backdrop-blur-sm rounded-lg border border-border/50">
          <p>No users match the current filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginatedUsers.map((user) => (
            <div 
              key={user.id} 
              className="bg-card/80 backdrop-blur-sm rounded-xl border border-border/50 p-4 hover:bg-card transition-colors cursor-pointer"
              onClick={() => onViewUser(user.id)}
            >
              {/* User Info Section */}
              <div className="flex flex-col items-center mb-4">
                <Avatar className="h-16 w-16 mb-3 ring-2 ring-border/50">
                  <AvatarImage src={user.photo_url} alt={user.display_name || user.full_name || user.email} />
                  <AvatarFallback className="bg-muted text-foreground text-lg font-semibold">
                    {getInitials(user.full_name || user.display_name, user.email)}
                  </AvatarFallback>
                </Avatar>
                
                <h3 className="text-foreground font-semibold text-center truncate max-w-full">
                  {user.display_name || user.full_name || 'Unknown'}
                </h3>
                
                <p className="text-muted-foreground text-sm truncate max-w-full mt-1">
                  {user.email}
                </p>
                
                {/* Status badges */}
                <div className="flex flex-wrap gap-1 mt-2 justify-center">
                  {user.blocked ? (
                    <Badge variant="destructive" className="text-xs">Blocked</Badge>
                  ) : user.is_verified ? (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Verified</Badge>
                  ) : user.verification_status === "rejected" ? (
                    <Badge variant="destructive" className="text-xs">Rejected</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">Pending</Badge>
                  )}
                  {user.paused && !user.blocked && <Badge variant="secondary" className="text-xs">Paused</Badge>}
                  {user.isAdmin && <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">Admin</Badge>}
                </div>
              </div>
              
              {/* Divider */}
              <div className="border-t border-primary/30 mb-3" />
              
              {/* Action Buttons Row */}
              <div className="flex flex-wrap justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                {!user.is_verified && user.verification_status === "pending" && (
                  <>
                    <button
                      onClick={() => handleVerificationToggle(user.id, user.is_verified)}
                      disabled={loading === user.id}
                      title="Approve"
                      className="h-10 w-10 rounded-lg border-2 border-primary/60 bg-transparent flex items-center justify-center hover:bg-primary/10 transition-colors disabled:opacity-50"
                    >
                      <Check className="h-4 w-4 text-primary" />
                    </button>
                    <button
                      onClick={() => setRejectDialogUser({ id: user.id, name: user.display_name || user.full_name || user.email })}
                      disabled={loading === user.id}
                      title="Reject"
                      className="h-10 w-10 rounded-lg border-2 border-primary/60 bg-transparent flex items-center justify-center hover:bg-destructive/10 transition-colors disabled:opacity-50"
                    >
                      <X className="h-4 w-4 text-destructive" />
                    </button>
                  </>
                )}
                {user.is_verified && (
                  <button
                    onClick={() => handleVerificationToggle(user.id, user.is_verified)}
                    disabled={loading === user.id}
                    title="Unverify"
                    className="h-10 w-10 rounded-lg border-2 border-primary/60 bg-transparent flex items-center justify-center hover:bg-primary/10 transition-colors disabled:opacity-50"
                  >
                    <X className="h-4 w-4 text-foreground" />
                  </button>
                )}
                <button
                  onClick={() => handlePauseToggle(user.id, user.paused)}
                  disabled={loading === user.id}
                  title={user.paused ? "Unpause" : "Pause"}
                  className="h-10 w-10 rounded-lg border-2 border-primary/60 bg-transparent flex items-center justify-center hover:bg-primary/10 transition-colors disabled:opacity-50"
                >
                  {user.paused ? <Play className="h-4 w-4 text-foreground" /> : <Pause className="h-4 w-4 text-foreground" />}
                </button>
                {user.id_image_url && (
                  <button
                    onClick={() => handleViewIdImage(user.id_image_url)}
                    title="View ID"
                    className="h-10 w-10 rounded-lg border-2 border-primary/60 bg-transparent flex items-center justify-center hover:bg-primary/10 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4 text-foreground" />
                  </button>
                )}
                <button
                  onClick={() => onViewUser(user.id)}
                  title="View User"
                  className="h-10 w-10 rounded-lg border-2 border-primary/60 bg-transparent flex items-center justify-center hover:bg-primary/10 transition-colors"
                >
                  <Eye className="h-4 w-4 text-foreground" />
                </button>
                <button
                  onClick={() => handleLockNameToggle(user.id, user.admin_locked_fields)}
                  disabled={loading === user.id || !user.full_name}
                  title={user.admin_locked_fields?.includes('full_name') ? "Unlock Name" : "Lock Name"}
                  className="h-10 w-10 rounded-lg border-2 border-primary/60 bg-transparent flex items-center justify-center hover:bg-primary/10 transition-colors disabled:opacity-50"
                >
                  {user.admin_locked_fields?.includes('full_name') ? (
                    <Lock className="h-4 w-4 text-destructive" />
                  ) : (
                    <Unlock className="h-4 w-4 text-foreground" />
                  )}
                </button>
                {!user.blocked && (
                  <button
                    onClick={() => setBlockDialogUser({ id: user.id, name: user.display_name || user.full_name || user.email })}
                    disabled={loading === user.id}
                    title="Block User"
                    className="h-10 w-10 rounded-lg border-2 border-primary/60 bg-transparent flex items-center justify-center hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  >
                    <ShieldX className="h-4 w-4 text-destructive" />
                  </button>
                )}
                <button
                  onClick={() => setMessageDialogUserId(user.id)}
                  title="Message User"
                  className="h-10 w-10 rounded-lg border-2 border-primary/60 bg-transparent flex items-center justify-center hover:bg-primary/10 transition-colors"
                >
                  <MessageSquare className="h-4 w-4 text-foreground" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination controls - bottom */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(pageNum)}
                  className="h-8 w-8 p-0 text-xs"
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
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

      {/* Reject Verification Dialog */}
      <RejectVerificationDialog
        open={!!rejectDialogUser}
        onOpenChange={(open) => !open && setRejectDialogUser(null)}
        onConfirm={(reason) => {
          if (rejectDialogUser) {
            handleRejectVerification(rejectDialogUser.id, reason);
            setRejectDialogUser(null);
          }
        }}
        userName={rejectDialogUser?.name}
      />

      {/* Direct Message Dialog */}
      {messageDialogUserId && (
        <DirectMessageDialog
          otherUserId={messageDialogUserId}
          open={!!messageDialogUserId}
          onOpenChange={(open) => !open && setMessageDialogUserId(null)}
        />
      )}
    </div>
  );
}
