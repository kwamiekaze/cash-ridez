import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, Eye, ExternalLink, Pause, Play, Lock, Unlock } from "lucide-react";
import { UserChip } from "@/components/UserChip";

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
  admin_locked_fields: string[] | null;
  full_name: string | null;
  created_at: string | null;
  verification_reviewed_at: string | null;
}

interface UserManagementTableProps {
  users: User[];
  onUpdate: () => void;
  onViewUser: (userId: string) => void;
}

export function UserManagementTable({ users, onUpdate, onViewUser }: UserManagementTableProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [filteredUsers, setFilteredUsers] = useState<User[]>(users);

  useEffect(() => {
    let filtered = [...users];
    
    // Role filter
    if (roleFilter === "rider") {
      filtered = filtered.filter(u => u.is_rider);
    } else if (roleFilter === "driver") {
      filtered = filtered.filter(u => u.is_driver);
    } else if (roleFilter === "verified") {
      filtered = filtered.filter(u => u.is_verified);
    }
    
    // Sort
    filtered.sort((a, b) => {
      if (sortBy === "created_at") {
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      } else if (sortBy === "created_at_asc") {
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      } else if (sortBy === "verification_date") {
        return new Date(b.verification_reviewed_at || 0).getTime() - new Date(a.verification_reviewed_at || 0).getTime();
      } else if (sortBy === "verification_date_asc") {
        return new Date(a.verification_reviewed_at || 0).getTime() - new Date(b.verification_reviewed_at || 0).getTime();
      }
      return 0;
    });
    
    setFilteredUsers(filtered);
  }, [users, roleFilter, sortBy]);

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
    <div className="rounded-md border overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead className="text-white font-semibold min-w-[150px]">User</TableHead>
              <TableHead className="text-white font-semibold min-w-[180px] hidden sm:table-cell">Email</TableHead>
              <TableHead className="text-white font-semibold min-w-[80px] hidden md:table-cell">Type</TableHead>
              <TableHead className="text-white font-semibold min-w-[100px]">Status</TableHead>
              <TableHead className="text-white font-semibold min-w-[70px] hidden lg:table-cell">Rating</TableHead>
              <TableHead className="text-white font-semibold min-w-[280px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.id} className="cursor-pointer hover:bg-muted/50 border-border/30" onClick={() => onViewUser(user.id)}>
                <TableCell className="min-w-[150px]">
                  <UserChip 
                    userId={user.id}
                    displayName={user.display_name}
                    fullName={user.full_name || undefined}
                    photoUrl={user.photo_url}
                    size="sm"
                    showCancellationBadge={false}
                  />
                </TableCell>
                <TableCell className="font-medium text-white text-xs sm:text-sm min-w-[180px] hidden sm:table-cell">
                  <div className="truncate max-w-[180px]" title={user.email}>{user.email}</div>
                </TableCell>
                <TableCell className="min-w-[80px] hidden md:table-cell">
                  <Badge variant="outline" className="text-white border-white/30 text-xs">User</Badge>
                </TableCell>
                <TableCell className="min-w-[100px]">
                  <div className="flex flex-col gap-1">
                    {user.is_verified ? (
                      <Badge className="bg-green-500 text-white text-xs whitespace-nowrap">Verified</Badge>
                    ) : user.verification_status === "rejected" ? (
                      <Badge variant="destructive" className="text-xs whitespace-nowrap">Rejected</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs whitespace-nowrap">Pending</Badge>
                    )}
                    {user.paused && <Badge variant="secondary" className="text-xs whitespace-nowrap">Paused</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-white text-xs sm:text-sm min-w-[70px] hidden lg:table-cell">
                  {user.rider_rating_avg > 0 || user.driver_rating_avg > 0
                    ? `${Math.max(user.rider_rating_avg, user.driver_rating_avg).toFixed(1)}`
                    : "N/A"}
                </TableCell>
                <TableCell className="min-w-[280px]">
                  <div className="flex gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                    {!user.is_verified && user.verification_status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleVerificationToggle(user.id, user.is_verified)}
                          disabled={loading === user.id}
                          title="Approve Verification"
                          className="h-8 px-2 text-xs whitespace-nowrap"
                        >
                          <Check className="h-3 w-3 mr-1" />
                          <span className="hidden sm:inline">Approve</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRejectVerification(user.id)}
                          disabled={loading === user.id}
                          title="Reject Verification"
                          className="h-8 px-2 text-xs whitespace-nowrap"
                        >
                          <X className="h-3 w-3 mr-1" />
                          <span className="hidden sm:inline">Reject</span>
                        </Button>
                      </>
                    )}
                    {user.is_verified && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleVerificationToggle(user.id, user.is_verified)}
                        disabled={loading === user.id}
                        title="Unverify User"
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-3 w-3 sm:h-4 sm:w-4" />
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
                      {user.paused ? <Play className="h-3 w-3 sm:h-4 sm:w-4" /> : <Pause className="h-3 w-3 sm:h-4 sm:w-4" />}
                    </Button>
                    {user.id_image_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewIdImage(user.id_image_url)}
                        className="h-8 w-8 p-0"
                        title="View ID"
                      >
                        <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onViewUser(user.id)}
                      className="h-8 w-8 p-0"
                      title="View User"
                    >
                      <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleLockNameToggle(user.id, user.admin_locked_fields)}
                      disabled={loading === user.id || !user.full_name}
                      title={user.admin_locked_fields?.includes('full_name') ? "Unlock full name" : "Lock full name"}
                      className="h-8 w-8 p-0"
                    >
                      {user.admin_locked_fields?.includes('full_name') ? (
                        <Lock className="h-3 w-3 sm:h-4 sm:w-4 text-destructive" />
                      ) : (
                        <Unlock className="h-3 w-3 sm:h-4 sm:w-4" />
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
