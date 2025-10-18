import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Car, LogOut, Plus, User, History, MapPin, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import StatusBadge from "@/components/StatusBadge";

const RiderDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("open");
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", user?.id).single();
      setProfile(data);
    };

    const fetchRequests = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("ride_requests")
        .select("*, assigned_driver:profiles!assigned_driver_id(display_name, rider_rating_avg, rider_rating_count)")
        .eq("rider_id", user.id)
        .order("created_at", { ascending: false });
      setRequests(data || []);
    };

    fetchProfile();
    fetchRequests();

    // Subscribe to changes
    const channel = supabase
      .channel("rider_requests_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ride_requests",
          filter: `rider_id=eq.${user?.id}`,
        },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

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
                <p className="text-xs text-muted-foreground">Member</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {profile && <StatusBadge status={profile.verification_status} />}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center p-0"
                  >
                    <User className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-card border-border z-50">
                  <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer">
                    <User className="w-4 h-4 mr-2" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab("history")} className="cursor-pointer">
                    <History className="w-4 h-4 mr-2" />
                    History
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => signOut()} className="cursor-pointer text-destructive">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
                    ? "Your ID is being reviewed. You'll be able to post trips once verified."
                    : "Please upload your ID to get verified and start posting trips."}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Button
            size="lg"
            className="h-20 text-lg bg-gradient-primary"
            onClick={() => navigate("/rider/create-request")}
            disabled={!profile?.is_verified}
          >
            <Plus className="w-6 h-6 mr-2" />
            Post Trip Request
          </Button>
          <Button 
            size="lg" 
            variant="secondary" 
            className="h-20 text-lg"
            onClick={() => navigate("/trips")}
          >
            <Car className="w-6 h-6 mr-2" />
            Respond to Requests
          </Button>
          <Button 
            size="lg" 
            variant="outline" 
            className="h-20 text-lg"
            onClick={() => navigate("/profile")}
          >
            <User className="w-6 h-6 mr-2" />
            View Profile
          </Button>
        </div>

        {/* Trips Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="assigned">Connected</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="mt-6 space-y-4">
            {requests.filter(r => r.status === "open").length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No open trip requests</p>
                <Button className="mt-4" onClick={() => navigate("/rider/create-request")}>
                  Create Your First Trip Request
                </Button>
              </Card>
            ) : (
              requests.filter(r => r.status === "open").map(request => (
                <Card key={request.id} className="p-6 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate(`/trip/${request.id}`)}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <StatusBadge status={request.status} />
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-success" />
                          <div>
                            <p className="font-medium">Pickup</p>
                            <p className="text-sm text-muted-foreground">{request.pickup_address}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-destructive" />
                          <div>
                            <p className="font-medium">Dropoff</p>
                            <p className="text-sm text-muted-foreground">{request.dropoff_address}</p>
                          </div>
                        </div>
                      </div>
                      {request.price_offer && (
                        <p className="text-lg font-semibold text-primary mt-2">
                          Offered: ${request.price_offer}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="assigned" className="mt-6 space-y-4">
            {requests.filter(r => r.status === "assigned").length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No connected trips</p>
              </Card>
            ) : (
              requests.filter(r => r.status === "assigned").map(request => (
                <Card key={request.id} className="p-6 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate(`/trip/${request.id}`)}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <StatusBadge status={request.status} />
                        {request.assigned_driver && (
                          <span className="text-sm text-muted-foreground">
                            Connected with {request.assigned_driver.display_name}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-success" />
                          <p className="text-sm">{request.pickup_address}</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-destructive" />
                          <p className="text-sm">{request.dropoff_address}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-6 space-y-4">
            {requests.filter(r => r.status === "completed").length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No completed trips yet</p>
              </Card>
            ) : (
              requests.filter(r => r.status === "completed").map(request => (
                <Card key={request.id} className="p-6 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate(`/trip/${request.id}`)}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <StatusBadge status={request.status} />
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(request.updated_at), "MMM d, yyyy")}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-success" />
                          <p className="text-sm">{request.pickup_address}</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-destructive" />
                          <p className="text-sm">{request.dropoff_address}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="cancelled" className="mt-6 space-y-4">
            {requests.filter(r => r.status === "cancelled").length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No cancelled trips</p>
              </Card>
            ) : (
              requests.filter(r => r.status === "cancelled").map(request => (
                <Card key={request.id} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <StatusBadge status={request.status} />
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(request.cancelled_at || request.updated_at), "MMM d, yyyy")}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-success" />
                          <p className="text-sm">{request.pickup_address}</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-destructive" />
                          <p className="text-sm">{request.dropoff_address}</p>
                        </div>
                      </div>
                      {request.cancel_reason_rider && (
                        <p className="text-sm text-muted-foreground mt-2">
                          Reason: {request.cancel_reason_rider}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-6 space-y-4">
            {requests.filter(r => r.status === "completed" || r.status === "cancelled").length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No trip history yet</p>
              </Card>
            ) : (
              requests.filter(r => r.status === "completed" || r.status === "cancelled").map(request => (
                <Card key={request.id} className="p-6 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate(`/trip/${request.id}`)}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <StatusBadge status={request.status} />
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(request.updated_at), "MMM d, yyyy")}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-success" />
                          <p className="text-sm">{request.pickup_address}</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-destructive" />
                          <p className="text-sm">{request.dropoff_address}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default RiderDashboard;
