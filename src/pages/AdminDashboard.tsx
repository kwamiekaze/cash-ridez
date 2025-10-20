import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Car, LogOut, Users, CheckCircle, XCircle, Shield, Loader2 } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { toast } from "sonner";
import { UserManagementTable } from "@/components/UserManagementTable";
import { UserDetailDialog } from "@/components/UserDetailDialog";
import { AdminRidesManagement } from "@/components/AdminRidesManagement";
import { useNavigate } from "react-router-dom";

const AdminDashboard = () => {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [stats, setStats] = useState({
    totalUsers: 0,
    verifiedUsers: 0,
    pendingVerifications: 0,
    openRequests: 0,
  });
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectUserId, setRejectUserId] = useState<string | null>(null);
  const [adminProfile, setAdminProfile] = useState<{ display_name?: string } | null>(null);

  // Check admin role on component mount
  useEffect(() => {
    const checkAdminRole = async () => {
      if (!user) {
        navigate("/auth");
        return;
      }

      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (error || !data) {
          console.error("Unauthorized access attempt to admin panel");
          toast.error("Access denied. Admin privileges required.");
          navigate("/dashboard");
          return;
        }

        setIsAdmin(true);
      } catch (error) {
        console.error("Error checking admin role:", error);
        toast.error("Access denied.");
        navigate("/dashboard");
      }
    };

    checkAdminRole();
  }, [user, navigate]);

  useEffect(() => {
    if (isAdmin === null) return; // Wait for admin check to complete
    const fetchStats = async () => {
      const { count: totalUsers } = await supabase.from("profiles").select("*", { count: "exact", head: true });
      const { count: verifiedUsers } = await supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_verified", true);
      const { count: pendingVerifications } = await supabase.from("profiles").select("*", { count: "exact", head: true }).eq("verification_status", "pending");
      const { count: openRequests } = await supabase.from("ride_requests").select("*", { count: "exact", head: true }).eq("status", "open");

      setStats({
        totalUsers: totalUsers || 0,
        verifiedUsers: verifiedUsers || 0,
        pendingVerifications: pendingVerifications || 0,
        openRequests: openRequests || 0,
      });
    };

    const fetchPendingUsers = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("verification_status", "pending")
        .order("verification_submitted_at", { ascending: false });

      setPendingUsers(data || []);
    };

    const fetchAllUsers = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      setAllUsers(data || []);
    };

    const fetchAdmin = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();
      setAdminProfile(data || null);
    };

    fetchStats();
    fetchPendingUsers();
    fetchAllUsers();
    fetchAdmin();
  }, [user, isAdmin]);

  // Show loading while checking admin status
  if (isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // This should never render if not admin, but just in case
  if (!isAdmin) {
    return null;
  }

  const handleViewUser = (userId: string) => {
    setSelectedUserId(userId);
    setUserDialogOpen(true);
  };

  const handleUserUpdate = () => {
    // Refresh all user data
    const fetchAllUsers = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      setAllUsers(data || []);
    };
    fetchAllUsers();
  };

  const handleVerification = async (userId: string, approved: boolean, reason?: string) => {
    const userToUpdate = pendingUsers.find((u) => u.id === userId) || allUsers.find((u) => u.id === userId);
    if (!userToUpdate) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        verification_status: approved ? "approved" : "rejected",
        is_verified: approved,
        verification_reviewed_at: new Date().toISOString(),
        verification_reviewer_id: user?.id || null,
        verification_notes: approved ? null : (reason || null),
      })
      .eq("id", userId);

    if (error) {
      toast.error("Failed to update verification");
      return;
    }

    // Send email notification
    try {
      await supabase.functions.invoke("send-status-notification", {
        body: {
          userEmail: userToUpdate.email,
          displayName: userToUpdate.display_name || userToUpdate.email,
          status: approved ? "approved" : "rejected",
          adminDisplayName: adminProfile?.display_name,
          reason: approved ? undefined : reason,
        },
      });
    } catch (emailError) {
      console.error("Error sending notification email:", emailError);
      // Don't fail the whole process if email fails
    }

    toast.success(`User ${approved ? "approved" : "rejected"}`);
    setPendingUsers(pendingUsers.filter((u) => u.id !== userId));
    // Refresh all users
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    setAllUsers(data || []);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="text-xl font-bold">Cash Ridez</span>
                <p className="text-xs text-muted-foreground">Admin Panel</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => signOut()}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalUsers}</p>
                <p className="text-sm text-muted-foreground">Total Users</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-verified/20 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-verified" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.verifiedUsers}</p>
                <p className="text-sm text-muted-foreground">Verified</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-warning/20 flex items-center justify-center">
                <Shield className="w-6 h-6 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pendingVerifications}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-accent/20 flex items-center justify-center">
                <Car className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.openRequests}</p>
                <p className="text-sm text-muted-foreground">Open Rides</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="verifications" className="w-full">
          <TabsList>
            <TabsTrigger value="verifications">Verifications</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="rides">Rides</TabsTrigger>
          </TabsList>

          <TabsContent value="verifications" className="mt-6">
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Pending Verifications</h2>
              {pendingUsers.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">No pending verifications</p>
                </Card>
              ) : (
                pendingUsers.map((user) => (
                  <Card key={user.id} className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">{user.display_name || user.email}</h3>
                          <StatusBadge status={user.verification_status} />
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{user.email}</p>
                        <div className="flex gap-2 mb-4">
                          {user.is_rider && <StatusBadge status="open" className="text-xs" />}
                          {user.is_driver && <StatusBadge status="assigned" className="text-xs" />}
                        </div>
                        {user.id_image_url && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                // Extract the file path from the full URL
                                const urlParts = user.id_image_url.split('/object/public/id-verifications/');
                                const filePath = urlParts[1] || user.id_image_url.split('/id-verifications/')[1];
                                
                                if (filePath) {
                                  const { data, error } = await supabase.storage
                                    .from('id-verifications')
                                    .createSignedUrl(filePath, 60); // 60 seconds expiry
                                  
                                  if (error) throw error;
                                  if (data?.signedUrl) {
                                    window.open(data.signedUrl, '_blank');
                                  }
                                } else {
                                  window.open(user.id_image_url, '_blank');
                                }
                              } catch (error) {
                                console.error('Error opening ID image:', error);
                                toast.error('Failed to open ID image');
                              }
                            }}
                          >
                            View ID Image
                          </Button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="bg-verified"
                          onClick={() => handleVerification(user.id, true)}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleVerification(user.id, false)}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="users" className="mt-6">
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">All Users</h2>
              <UserManagementTable 
                users={allUsers} 
                onUpdate={handleUserUpdate}
                onViewUser={handleViewUser}
              />
            </div>
          </TabsContent>

          <TabsContent value="rides" className="mt-6">
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">All Rides</h2>
              <AdminRidesManagement />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Verification</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Add a reason for rejection (optional)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!rejectUserId) return;
                handleVerification(rejectUserId, false, rejectReason);
                setRejectDialogOpen(false);
                setRejectUserId(null);
                setRejectReason("");
              }}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UserDetailDialog
        userId={selectedUserId}
        open={userDialogOpen}
        onOpenChange={setUserDialogOpen}
        onUpdate={handleUserUpdate}
      />
    </div>
  );
};

export default AdminDashboard;
