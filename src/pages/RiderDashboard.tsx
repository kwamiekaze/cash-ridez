import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Car, LogOut, Plus, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "@/components/StatusBadge";

const RiderDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("open");
  const [requests, setRequests] = useState<any[]>([]);

  useState(() => {
    const fetchProfile = async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user?.id).single();
      setProfile(data);
    };
    fetchProfile();
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
                <Car className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="text-xl font-bold">Cash Ridez</span>
                <p className="text-xs text-muted-foreground">Rider</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {profile && (
                <div className="flex items-center gap-2">
                  <StatusBadge status={profile.verification_status} />
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => navigate('/profile')}
                    className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center p-0"
                  >
                    <User className="w-4 h-4" />
                  </Button>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => signOut()}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Verification Notice */}
        {profile && !profile.is_verified && (
          <Card className="p-6 mb-6 bg-warning/10 border-warning">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center">
                <StatusBadge status={profile.verification_status} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Verification {profile.verification_status}</h3>
                <p className="text-sm text-muted-foreground">
                  {profile.verification_status === "pending"
                    ? "Your ID is being reviewed. You'll be able to request rides once verified."
                    : "Please upload your ID to get verified and start requesting rides."}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Button
            size="lg"
            className="h-24 text-lg bg-gradient-primary"
            onClick={() => navigate("/rider/create-request")}
            disabled={!profile?.is_verified}
          >
            <Plus className="w-6 h-6 mr-2" />
            New Ride Request
          </Button>
          <Button 
            size="lg" 
            variant="outline" 
            className="h-24 text-lg"
            onClick={() => navigate("/profile")}
          >
            <User className="w-6 h-6 mr-2" />
            View Profile
          </Button>
        </div>

        {/* Rides Tabs */}
        <Tabs defaultValue="open" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="assigned">Assigned</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="mt-6">
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No open ride requests</p>
              <Button className="mt-4" onClick={() => navigate("/rider/create-request")}>
                Create Your First Request
              </Button>
            </Card>
          </TabsContent>

          <TabsContent value="assigned">
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No assigned rides</p>
            </Card>
          </TabsContent>

          <TabsContent value="completed">
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No completed rides yet</p>
            </Card>
          </TabsContent>

          <TabsContent value="cancelled">
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No cancelled rides</p>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default RiderDashboard;
