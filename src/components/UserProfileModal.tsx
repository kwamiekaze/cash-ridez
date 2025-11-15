import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RatingDisplay } from "@/components/RatingDisplay";
import { CancellationBadge } from "@/components/CancellationBadge";
import { MemberBadge } from "@/components/MemberBadge";
import { AdminBadge } from "@/components/AdminBadge";
import { Car } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UserProfileModalProps {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UserProfile {
  id: string;
  full_name: string | null;
  display_name: string | null;
  photo_url: string | null;
  bio: string | null;
  rider_rating_avg: number;
  rider_rating_count: number;
  driver_rating_avg: number;
  driver_rating_count: number;
  is_member: boolean;
  is_verified: boolean;
  car_year: string | null;
  car_make: string | null;
  car_model: string | null;
}

export function UserProfileModal({ userId, open, onOpenChange }: UserProfileModalProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cancelRate, setCancelRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId || !open) return;

    const fetchProfile = async () => {
      setLoading(true);
      try {
        // Fetch profile data
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name, display_name, photo_url, bio, rider_rating_avg, rider_rating_count, driver_rating_avg, driver_rating_count, is_member, is_verified, car_year, car_make, car_model")
          .eq("id", userId)
          .single();

        if (profileData) {
          setProfile(profileData);
        }

        // Check if admin
        const { data: adminData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle();

        setIsAdmin(!!adminData);

        // Fetch cancellation stats
        const { data: cancelData } = await supabase
          .from("cancellation_stats")
          .select("rider_rate_90d, driver_rate_90d")
          .eq("user_id", userId)
          .maybeSingle();

        if (cancelData) {
          const worstRate = Math.max(cancelData.rider_rate_90d || 0, cancelData.driver_rate_90d || 0);
          setCancelRate(worstRate);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [userId, open]);

  if (!profile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Loading...</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const displayName = profile.full_name || profile.display_name || "User";
  const hasVehicleInfo = profile.car_year || profile.car_make || profile.car_model;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>User Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Avatar and Name */}
          <div className="flex flex-col items-center gap-3">
            <Avatar className="h-24 w-24">
              <AvatarImage src={profile.photo_url || undefined} />
              <AvatarFallback className="text-2xl">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <h3 className="text-xl font-semibold">{displayName}</h3>
              <div className="flex items-center justify-center gap-2 mt-2">
                {profile.is_verified && (
                  <Badge variant="outline" className="border-green-500 text-green-500">
                    ✓ Verified
                  </Badge>
                )}
                {profile.is_member && <MemberBadge isMember={profile.is_member} />}
                {isAdmin && <AdminBadge isAdmin={isAdmin} />}
              </div>
            </div>
          </div>

          {/* Ratings */}
          <Card className="p-4 space-y-3">
            <h4 className="font-semibold text-sm">Ratings</h4>
            {profile.rider_rating_count > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">As Rider:</span>
                <RatingDisplay 
                  rating={profile.rider_rating_avg} 
                  count={profile.rider_rating_count}
                />
              </div>
            )}
            {profile.driver_rating_count > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">As Driver:</span>
                <RatingDisplay 
                  rating={profile.driver_rating_avg} 
                  count={profile.driver_rating_count}
                />
              </div>
            )}
            {profile.rider_rating_count === 0 && profile.driver_rating_count === 0 && (
              <p className="text-sm text-muted-foreground">No ratings yet</p>
            )}
          </Card>

          {/* Cancellation Rate */}
          {cancelRate !== null && (
            <Card className="p-4">
              <h4 className="font-semibold text-sm mb-2">Cancellation Rate</h4>
              <CancellationBadge userId={profile.id} size="md" />
            </Card>
          )}

          {/* Bio */}
          {profile.bio && (
            <Card className="p-4">
              <h4 className="font-semibold text-sm mb-2">Bio</h4>
              <p className="text-sm text-muted-foreground">{profile.bio}</p>
            </Card>
          )}

          {/* Vehicle Information */}
          {hasVehicleInfo && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Car className="h-4 w-4" />
                <h4 className="font-semibold text-sm">Vehicle</h4>
              </div>
              <p className="text-sm">
                {profile.car_year && `${profile.car_year} `}
                {profile.car_make && `${profile.car_make} `}
                {profile.car_model && profile.car_model}
              </p>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
