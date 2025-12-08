import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Crown, MapPin, Clock, Shield, User, Car, Route, CheckCircle, XCircle, AlertCircle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface MapUserInfo {
  id: string;
  display_name: string | null;
  full_name: string | null;
  photo_url: string | null;
  email?: string | null;
  phone_number?: string | null;
  active_role?: string | null;
  is_verified?: boolean | null;
  verification_status?: string | null;
  location_updated_at?: string | null;
  current_lat?: number | null;
  current_lng?: number | null;
  subscription_active?: boolean | null;
  car_make?: string | null;
  car_model?: string | null;
  car_year?: string | null;
  isAdmin?: boolean;
  isDriver?: boolean;
  isRider?: boolean;
  map_history_hidden_from_public?: boolean | null;
  is_map_visible?: boolean | null;
}

// Helper to determine visibility debug reasons
const getVisibilityDebugInfo = (user: MapUserInfo): { visible: boolean; reasons: string[] } => {
  const reasons: string[] = [];
  
  // Check location
  if (!user.current_lat || !user.current_lng) {
    reasons.push("No pin location recorded");
  }
  
  // Check visibility toggle
  if (user.is_map_visible === false) {
    if (user.subscription_active) {
      reasons.push("Visibility toggled off by user (subscriber)");
    } else if (user.isAdmin) {
      reasons.push("Visibility toggled off by admin");
    } else {
      reasons.push("Visibility incorrectly set to off (non-subscriber - should be fixed)");
    }
  }
  
  // Check hidden history (temporary - cleared when user updates pin)
  if (user.map_history_hidden_from_public) {
    reasons.push("Temporarily cleared by admin (will reappear after user updates pin)");
  }
  
  // Check last update time
  if (user.location_updated_at) {
    const now = new Date();
    const lastUpdate = new Date(user.location_updated_at);
    const diffHours = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
    if (diffHours > 24) {
      reasons.push(`Last pin update was ${Math.floor(diffHours)} hours ago`);
    }
  } else {
    reasons.push("Never updated their pin");
  }
  
  const visible = reasons.length === 0 || 
    (reasons.every(r => r.includes("hours ago") || r.includes("Never updated")));
  
  return { visible, reasons };
};

interface AdminMapUserInfoPanelProps {
  user: MapUserInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHistoryCleared?: () => void;
}

export function AdminMapUserInfoPanel({ user, open, onOpenChange, onHistoryCleared }: AdminMapUserInfoPanelProps) {
  const { user: authUser } = useAuth();
  const { toast } = useToast();
  const [clearing, setClearing] = useState(false);

  if (!user) return null;

  const name = user.full_name || user.display_name || "Unknown User";
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  
  const getVerificationBadge = () => {
    if (user.is_verified) {
      return (
        <Badge variant="default" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
          <CheckCircle className="h-3 w-3 mr-1" />
          Verified
        </Badge>
      );
    }
    if (user.verification_status === "pending") {
      return (
        <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          <AlertCircle className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <XCircle className="h-3 w-3 mr-1" />
        Not Verified
      </Badge>
    );
  };

  const getRoleBadges = () => {
    const badges = [];
    if (user.isAdmin) {
      badges.push(
        <Badge key="admin" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          <Crown className="h-3 w-3 mr-1" />
          Admin
        </Badge>
      );
    }
    if (user.isDriver || user.active_role === 'driver') {
      badges.push(
        <Badge key="driver" variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
          <Car className="h-3 w-3 mr-1" />
          Driver
        </Badge>
      );
    }
    if (user.isRider || user.active_role === 'rider') {
      badges.push(
        <Badge key="rider" variant="secondary" className="bg-purple-500/20 text-purple-400 border-purple-500/30">
          <Route className="h-3 w-3 mr-1" />
          Rider
        </Badge>
      );
    }
    return badges;
  };

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return "Never";
    try {
      return format(new Date(timestamp), "MMM d, yyyy 'at' h:mm a");
    } catch {
      return "Unknown";
    }
  };

  const getOnlineStatus = () => {
    if (!user.location_updated_at) return { status: "unknown", label: "Unknown" };
    
    const now = new Date();
    const lastUpdate = new Date(user.location_updated_at);
    const diffMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
    
    if (diffMinutes <= 10) {
      return { status: "online", label: "Online (active)" };
    } else if (diffMinutes <= 60) {
      return { status: "away", label: "Away" };
    }
    return { status: "offline", label: "Offline" };
  };

  // Clear user's map visibility history (admin action)
  const handleClearUserHistory = async () => {
    if (!authUser) return;
    
    setClearing(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          map_history_hidden_from_public: true,
          map_history_cleared_at: new Date().toISOString(),
          map_history_cleared_by: authUser.id,
        })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "User cleared from map",
        description: `${name} is now hidden until they update their pin again.`,
      });
      
      onHistoryCleared?.();
    } catch (error) {
      console.error("Error clearing user map history:", error);
      toast({
        title: "Error",
        description: "Failed to clear map history.",
        variant: "destructive",
      });
    } finally {
      setClearing(false);
    }
  };

  const onlineInfo = getOnlineStatus();
  const carInfo = [user.car_year, user.car_make, user.car_model].filter(Boolean).join(" ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-12 w-12 border-2 border-primary">
              <AvatarImage src={user.photo_url || undefined} alt={name} />
              <AvatarFallback className="bg-muted text-muted-foreground">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="flex items-center gap-2">
                {name}
                {user.subscription_active && <Crown className="h-4 w-4 text-yellow-500" />}
              </span>
              <span className="text-xs font-normal text-muted-foreground">User ID: {user.id.slice(0, 8)}...</span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Online Status */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              onlineInfo.status === 'online' ? 'bg-emerald-500' :
              onlineInfo.status === 'away' ? 'bg-yellow-500' : 'bg-gray-500'
            }`} />
            <span className="text-sm text-muted-foreground">{onlineInfo.label}</span>
          </div>

          {/* Roles */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <User className="h-3 w-3" /> Roles
            </label>
            <div className="flex flex-wrap gap-2">
              {getRoleBadges()}
            </div>
          </div>

          {/* Verification */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Shield className="h-3 w-3" /> Verification
            </label>
            {getVerificationBadge()}
          </div>

          {/* Vehicle Info (if driver) */}
          {carInfo && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Car className="h-3 w-3" /> Vehicle
              </label>
              <p className="text-sm">{carInfo}</p>
            </div>
          )}

          {/* Contact Info */}
          {(user.email || user.phone_number) && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">Contact</label>
              {user.email && <p className="text-sm">{user.email}</p>}
              {user.phone_number && <p className="text-sm">{user.phone_number}</p>}
            </div>
          )}

          {/* Timestamps */}
          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Last location update:</span>
              <span>{formatTimestamp(user.location_updated_at)}</span>
            </div>
            
            {user.current_lat && user.current_lng && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Approx. coordinates: {user.current_lat.toFixed(2)}, {user.current_lng.toFixed(2)}</span>
              </div>
            )}

            {/* Map Visibility Debug Info (Admin Only) */}
            {(() => {
              const debugInfo = getVisibilityDebugInfo(user);
              return (
                <div className="space-y-2 mt-3 p-3 rounded-lg bg-muted/30 border border-border">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      debugInfo.visible ? 'bg-emerald-500' : 'bg-red-500'
                    }`} />
                    <span className="text-xs font-medium">
                      Map Visibility: {debugInfo.visible ? 'Visible' : 'Hidden'}
                    </span>
                  </div>
                  {debugInfo.reasons.length > 0 && (
                    <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                      {debugInfo.reasons.map((reason, i) => (
                        <li key={i} className="flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 text-amber-400" />
                          {reason}
                        </li>
                      ))}
                    </ul>
                  )}
                  {user.is_map_visible === false && !user.subscription_active && !user.isAdmin && (
                    <p className="text-xs text-red-400 mt-2">
                      ⚠️ Bug detected: Non-subscriber has visibility off. This should auto-fix on next update.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Admin Actions */}
          <div className="border-t border-border pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearUserHistory}
              disabled={clearing}
              className="w-full text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {clearing ? "Clearing..." : "Clear from map (temporary)"}
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Hides user until they update their pin again.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
