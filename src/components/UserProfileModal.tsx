import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RatingDisplay } from "@/components/RatingDisplay";
import { CancellationBadge } from "@/components/CancellationBadge";
import { AdminBadge } from "@/components/AdminBadge";
import { PremiumCrown } from "@/components/PremiumCrown";
import { Car, MessageCircle, ExternalLink, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DirectMessageDialog } from "@/components/DirectMessageDialog";
import { AdminBanUserDialog } from "@/components/AdminBanUserDialog";

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
  subscription_active: boolean;
  subscription_status: string | null;
}

export function UserProfileModal({ userId, open, onOpenChange }: UserProfileModalProps) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  const [primaryRole, setPrimaryRole] = useState<"rider" | "driver">("rider");
  const [loading, setLoading] = useState(false);
  const [idImageUrl, setIdImageUrl] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [dmDialogOpen, setDmDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [chatRooms, setChatRooms] = useState<Array<{ id: string; name: string }>>([]);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);

  useEffect(() => {
    if (!userId || !open || !user) return;

    const fetchProfile = async () => {
      setLoading(true);
      try {
        // Check if viewer is admin
        const { data: viewerAdminData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();
        
        setViewerIsAdmin(!!viewerAdminData);

        // Fetch profile data (including phone number for admins)
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name, display_name, photo_url, bio, rider_rating_avg, rider_rating_count, driver_rating_avg, driver_rating_count, is_member, is_verified, car_year, car_make, car_model, id_image_url, email, phone_number, subscription_active, subscription_status")
          .eq("id", userId)
          .single();

        // Check if viewer can see phone number
        if (viewerAdminData && profileData) {
          setPhoneNumber(profileData.phone_number);
        }

        // Fetch chat rooms for ban dialog
        if (viewerAdminData) {
          const { data: rooms } = await supabase
            .from("chat_rooms")
            .select("id, name")
            .eq("is_active", true);
          setChatRooms(rooms || []);
        }

        if (profileData) {
          setProfile(profileData as any);
          
          // If admin and there's an ID image, get signed URL
          if (viewerAdminData && profileData.id_image_url) {
            const { data: signedUrlData } = await supabase.storage
              .from('id-verifications')
              .createSignedUrl(profileData.id_image_url, 3600);
            
            if (signedUrlData) {
              setIdImageUrl(signedUrlData.signedUrl);
            }
          }
        }

        // Check if profile user is admin
        const { data: adminData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle();

        setIsAdmin(!!adminData);

        // Determine primary role based on rating counts
        if (profileData) {
          const riderCount = profileData.rider_rating_count || 0;
          const driverCount = profileData.driver_rating_count || 0;
          setPrimaryRole(driverCount > riderCount ? "driver" : "rider");
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [userId, open, user]);

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
            <Avatar 
              className="h-24 w-24 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
              onClick={() => profile.photo_url && setImagePreviewOpen(true)}
            >
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
                {profile.subscription_active && (profile.subscription_status === 'active' || profile.subscription_status === 'trialing') && (
                  <div className="flex items-center gap-1">
                    <PremiumCrown size={16} />
                    <span className="text-xs text-[hsl(var(--premium-gold))]">Premium</span>
                  </div>
                )}
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
          <Card className="p-4">
            <h4 className="font-semibold text-sm mb-2">Cancellation Rate</h4>
            <CancellationBadge userId={profile.id} role={primaryRole} size="md" />
          </Card>

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

          {/* Admin-only ID Image */}
          {viewerIsAdmin && idImageUrl && (
            <Card className="p-4">
              <h4 className="font-semibold text-sm mb-2">Submitted ID</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const imgDialog = document.createElement('dialog');
                  imgDialog.className = 'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm';
                  imgDialog.innerHTML = `
                    <div class="fixed inset-0 flex items-center justify-center p-4" onclick="this.parentElement.close()">
                      <div class="relative max-w-4xl max-h-[90vh] bg-background rounded-lg p-4" onclick="event.stopPropagation()">
                        <button onclick="this.closest('dialog').close()" class="absolute top-2 right-2 p-2 rounded-full bg-background/80 hover:bg-background text-foreground">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        </button>
                        <img src="${idImageUrl}" alt="ID Verification" class="max-w-full max-h-[80vh] object-contain rounded" />
                      </div>
                    </div>
                  `;
                  document.body.appendChild(imgDialog);
                  imgDialog.showModal();
                  imgDialog.addEventListener('close', () => imgDialog.remove());
                }}
                className="w-full"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View ID Image
              </Button>
            </Card>
          )}

          {/* Message User Button */}
          {userId !== user?.id && (
            <>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setDmDialogOpen(true)}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Message User
              </Button>

              {viewerIsAdmin && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setBanDialogOpen(true)}
                >
                  <Shield className="mr-2 h-4 w-4" />
                  Moderate User
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>

      {userId && (
        <>
          <DirectMessageDialog
            otherUserId={userId}
            open={dmDialogOpen}
            onOpenChange={setDmDialogOpen}
          />
          <AdminBanUserDialog
            userId={userId}
            userName={profile?.display_name || profile?.full_name || "User"}
            chatRooms={chatRooms}
            open={banDialogOpen}
            onOpenChange={setBanDialogOpen}
          />
        </>
      )}

      {/* Image Preview Dialog */}
      <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-black/95">
          <div className="relative w-full h-[80vh] flex items-center justify-center">
            <button
              onClick={() => setImagePreviewOpen(false)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-background/80 hover:bg-background text-foreground"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <img 
              src={profile?.photo_url || undefined} 
              alt={displayName}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
