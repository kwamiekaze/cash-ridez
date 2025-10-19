import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { RatingDisplay } from "@/components/RatingDisplay";

interface UserDetailDialogProps {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export function UserDetailDialog({ userId, open, onOpenChange, onUpdate }: UserDetailDialogProps) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    phone_number: "",
    bio: "",
  });

  useEffect(() => {
    if (userId && open) {
      fetchUserDetails();
    }
  }, [userId, open]);

  const fetchUserDetails = async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) throw error;
      
      setUser(data);
      setFormData({
        full_name: data.full_name || "",
        phone_number: data.phone_number || "",
        bio: data.bio || "",
      });
    } catch (error: any) {
      toast.error("Failed to fetch user details");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!userId) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update(formData)
        .eq("id", userId);

      if (error) throw error;

      toast.success("User updated successfully");
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Failed to update user");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center">
            {loading ? "Loading..." : "User not found"}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
          <DialogDescription>View and edit user information</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* User Header */}
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={user.photo_url} />
              <AvatarFallback className="text-2xl">
                {(user.display_name || user.email || "U")[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="text-lg font-semibold">{user.display_name}</h3>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <div className="flex gap-2 mt-2">
                {user.is_verified ? (
                  <Badge className="bg-green-500">Verified</Badge>
                ) : (
                  <Badge variant="destructive">Unverified</Badge>
                )}
                {user.is_rider && <Badge variant="secondary">Rider</Badge>}
                {user.is_driver && <Badge variant="secondary">Driver</Badge>}
              </div>
            </div>
          </div>

          {/* ID Verification */}
          {user.id_image_url && (
            <Card className="p-4">
              <Label className="text-sm font-medium mb-2 block">ID Verification Image</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(user.id_image_url, "_blank")}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View ID Image
              </Button>
            </Card>
          )}

          {/* Ratings */}
          <div className="grid grid-cols-2 gap-4">
            {user.is_rider && (
              <Card className="p-4">
                <Label className="text-sm font-medium mb-2 block">Rider Rating</Label>
                {user.rider_rating_count > 0 ? (
                  <RatingDisplay
                    rating={user.rider_rating_avg}
                    count={user.rider_rating_count}
                    size="lg"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No ratings yet</p>
                )}
              </Card>
            )}
            {user.is_driver && (
              <Card className="p-4">
                <Label className="text-sm font-medium mb-2 block">Driver Rating</Label>
                {user.driver_rating_count > 0 ? (
                  <RatingDisplay
                    rating={user.driver_rating_avg}
                    count={user.driver_rating_count}
                    size="lg"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No ratings yet</p>
                )}
              </Card>
            )}
          </div>

          {/* Edit Form */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name (Admin Edit)</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone_number">Phone Number (Admin Only View)</Label>
              <Input
                id="phone_number"
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio (Admin Only View)</Label>
              <Textarea
                id="bio"
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          {/* Account Info */}
          <Card className="p-4 bg-muted/50">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">User ID</p>
                <p className="font-mono text-xs">{user.id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Member Since</p>
                <p>{new Date(user.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Verification Status</p>
                <p className="capitalize">{user.verification_status}</p>
              </div>
              {user.blocked && (
                <div>
                  <p className="text-destructive font-medium">Account Blocked</p>
                  {user.blocked_until && (
                    <p className="text-xs">Until: {new Date(user.blocked_until).toLocaleString()}</p>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
