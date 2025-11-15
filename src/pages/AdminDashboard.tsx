import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppHeader from "@/components/AppHeader";
import AdminRoute from "@/components/AdminRoute";
import { UserManagementTable } from "@/components/UserManagementTable";
import { AdminRidesManagement } from "@/components/AdminRidesManagement";
import { SubscribedMembersTab } from "@/components/SubscribedMembersTab";
import { MapBackground } from "@/components/MapBackground";
import { CommunityChat } from "@/components/CommunityChat";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Shield, Users, Crown, Car, MessageSquare } from "lucide-react";
import { motion } from "motion/react";
import FloatingSupport from "@/components/FloatingSupport";
import { FloatingChat } from "@/components/FloatingChat";
import { UserDetailDialog } from "@/components/UserDetailDialog";

const AdminDashboard = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("verifications");
  const [profile, setProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      
      setProfile(data);

      // Check admin role
      const { data: hasAdmin } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role: 'admin'
      });
      setIsAdmin(Boolean(hasAdmin));
    };

    fetchProfile();
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchUsers();
  }, [isAdmin]);

  const fetchUsers = async () => {
    // Fetch all users
    const { data: allData } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    
    setAllUsers(allData || []);

    // Fetch pending verification users
    const { data: pendingData } = await supabase
      .from("profiles")
      .select("*")
      .eq("verification_status", "pending")
      .order("verification_submitted_at", { ascending: false });
    
    setPendingUsers(pendingData || []);
  };

  const menuItems = [
    { id: "verifications", label: "Verifications", icon: Shield },
    { id: "users", label: "Users", icon: Users },
    { id: "subscribed", label: "Subscribed", icon: Crown },
    { id: "rides", label: "Rides", icon: Car },
    { id: "community", label: "Chat/Community", icon: MessageSquare },
  ];

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setMobileMenuOpen(false);
  };

  const handleViewUser = (userId: string) => {
    setSelectedUserId(userId);
    setUserDialogOpen(true);
  };

  return (
    <AdminRoute>
      <div className="min-h-screen bg-background relative">
        <MapBackground />
        
        <AppHeader showStatus={false} />

        <div className="container mx-auto px-4 py-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2">
                  Admin Dashboard
                </h1>
                <p className="text-muted-foreground">
                  Manage users, verifications, and system operations
                </p>
              </div>

              {/* Mobile Menu Button */}
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild className="lg:hidden">
                  <Button variant="outline" size="icon">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 bg-card">
                  <div className="flex flex-col gap-2 mt-8">
                    {menuItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Button
                          key={item.id}
                          variant={activeTab === item.id ? "default" : "ghost"}
                          className="w-full justify-start gap-2"
                          onClick={() => handleTabChange(item.id)}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Button>
                      );
                    })}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </motion.div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            {/* Desktop Navigation */}
            <TabsList className="hidden lg:grid w-full grid-cols-5 bg-card/50 backdrop-blur-sm border border-border/50">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <TabsTrigger
                    key={item.id}
                    value={item.id}
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="verifications" className="space-y-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <UserManagementTable 
                  users={pendingUsers} 
                  onUpdate={fetchUsers}
                  onViewUser={handleViewUser}
                />
              </motion.div>
            </TabsContent>

            <TabsContent value="users" className="space-y-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <UserManagementTable 
                  users={allUsers} 
                  onUpdate={fetchUsers}
                  onViewUser={handleViewUser}
                />
              </motion.div>
            </TabsContent>

            <TabsContent value="subscribed" className="space-y-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <SubscribedMembersTab />
              </motion.div>
            </TabsContent>

            <TabsContent value="rides" className="space-y-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <AdminRidesManagement />
              </motion.div>
            </TabsContent>

            <TabsContent value="community" className="space-y-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <CommunityChat />
              </motion.div>
            </TabsContent>
          </Tabs>
        </div>

        <FloatingSupport inChatTab={activeTab === "community"} />
        <FloatingChat inChatTab={activeTab === "community"} />

        {selectedUserId && (
          <UserDetailDialog
            userId={selectedUserId}
            open={userDialogOpen}
            onOpenChange={setUserDialogOpen}
            onUpdate={fetchUsers}
          />
        )}
      </div>
    </AdminRoute>
  );
};

export default AdminDashboard;
