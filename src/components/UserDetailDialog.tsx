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
import { format } from "date-fns";
import StatusBadge from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { RatingDisplay } from "@/components/RatingDisplay";
import { CancellationBadge } from "@/components/CancellationBadge";

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
    display_name: "",
    phone_number: "",
    bio: "",
    paused: false,
    admin_locked_fields: [] as string[],
    created_at: "",
    verification_status: "pending" as "approved" | "pending" | "rejected",
    active_role: null as string | null,
    is_rider: false,
    is_driver: false,
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
        display_name: data.display_name || "",
        phone_number: data.phone_number || "",
        bio: data.bio || "",
        paused: data.paused || false,
        admin_locked_fields: data.admin_locked_fields || [],
        created_at: data.created_at || "",
        verification_status: data.verification_status || "pending",
        active_role: data.active_role || null,
        is_rider: data.is_rider || false,
        is_driver: data.is_driver || false,
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

    // Validate full name - only allow letters, spaces, hyphens, apostrophes, and periods
    if (formData.full_name && !/^[a-zA-Z\s'\-\.]+$/.test(formData.full_name)) {
      toast.error("Full name can only contain letters, spaces, hyphens, apostrophes, and periods");
      return;
    }

    setSaving(true);
    try {
      // When admin updates full_name, also update display_name to keep them in sync
      const updateData = {
        ...formData,
        display_name: formData.full_name || formData.display_name,
      };

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
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
                <Badge variant="outline">User Account</Badge>
                {user.paused && <Badge variant="secondary">Paused</Badge>}
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
                onClick={async () => {
                  try {
                    // id_image_url now stores the file path directly
                    const { data, error } = await supabase.storage
                      .from('id-verifications')
                      .createSignedUrl(user.id_image_url, 3600); // 1 hour expiry
                    
                    if (error) throw error;
                    if (data?.signedUrl) {
                      window.open(data.signedUrl, '_blank');
                    }
                  } catch (error) {
                    console.error('Error opening ID image:', error);
                    toast.error('Failed to open ID image');
                  }
                }}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View ID Image
              </Button>
            </Card>
          )}

          {/* Ratings */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4">
              <Label className="text-sm font-medium mb-2 block">Cancellation Rate</Label>
              <CancellationBadge userId={user.id} role="both" size="md" showIcon={true} />
            </Card>
            <Card className="p-4">
              <Label className="text-sm font-medium mb-2 block">User Rating</Label>
              {(user.rider_rating_count > 0 || user.driver_rating_count > 0) ? (
                <RatingDisplay
                  rating={Math.max(user.rider_rating_avg || 0, user.driver_rating_avg || 0)}
                  count={(user.rider_rating_count || 0) + (user.driver_rating_count || 0)}
                  size="lg"
                />
              ) : (
                <p className="text-sm text-muted-foreground">No ratings yet</p>
              )}
            </Card>
            <Card className="p-4">
              <Label className="text-sm font-medium mb-2 block">Account Status</Label>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Paused</span>
                  <input
                    type="checkbox"
                    checked={formData.paused}
                    onChange={(e) => setFormData({ ...formData, paused: e.target.checked })}
                    className="h-4 w-4"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Paused accounts cannot create or accept trip requests
                </p>
              </div>
            </Card>
          </div>

          {/* Edit Form */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name (Admin Edit)</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => {
                  const value = e.target.value;
                  // Only allow letters, spaces, hyphens, apostrophes, and periods
                  if (value === '' || /^[a-zA-Z\s'\-\.]+$/.test(value)) {
                    setFormData({ ...formData, full_name: value });
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">Letters, spaces, hyphens, apostrophes, and periods only</p>
              <p className="text-xs text-primary">This will update the user's name everywhere on the site</p>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="lock_full_name"
                  checked={formData.admin_locked_fields.includes('full_name')}
                  onChange={(e) => {
                    const locked = e.target.checked;
                    setFormData({
                      ...formData,
                      admin_locked_fields: locked
                        ? [...formData.admin_locked_fields.filter(f => f !== 'full_name'), 'full_name']
                        : formData.admin_locked_fields.filter(f => f !== 'full_name')
                    });
                  }}
                  className="h-4 w-4"
                />
                <Label htmlFor="lock_full_name" className="text-sm font-normal cursor-pointer">
                  Lock full name (user cannot change)
                </Label>
              </div>
              {formData.admin_locked_fields.includes('full_name') && (
                <p className="text-xs text-warning">⚠️ This field is locked. User cannot edit it.</p>
              )}
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
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground">User ID</Label>
              <div className="font-mono text-xs break-all bg-muted p-2 rounded">
                {userId}
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Member Since</Label>
              <div className="font-medium">
                {formData.created_at ? format(new Date(formData.created_at), "MMMM d, yyyy") : "N/A"}
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Verification Status</Label>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={formData.verification_status} />
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground mb-3 block">User Roles</Label>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Rider Role</span>
                    {formData.is_rider && <Badge variant="secondary" className="text-xs">Active</Badge>}
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.is_rider}
                    onChange={(e) => {
                      const isRider = e.target.checked;
                      setFormData({ 
                        ...formData, 
                        is_rider: isRider,
                        active_role: isRider ? 'rider' : (formData.is_driver ? 'driver' : null)
                      });
                    }}
                    className="h-4 w-4"
                  />
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Driver Role</span>
                    {formData.is_driver && <Badge variant="secondary" className="text-xs">Active</Badge>}
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.is_driver}
                    onChange={(e) => {
                      const isDriver = e.target.checked;
                      setFormData({ 
                        ...formData, 
                        is_driver: isDriver,
                        active_role: isDriver ? 'driver' : (formData.is_rider ? 'rider' : null)
                      });
                    }}
                    className="h-4 w-4"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Toggle roles to control user access. Active role determines initial dashboard view.
                </p>
              </div>
            </div>
            {formData.admin_locked_fields && formData.admin_locked_fields.length > 0 && (
              <div>
                <Label className="text-muted-foreground">Locked Fields</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {formData.admin_locked_fields.map((field: string) => (
                    <Badge key={field} variant="destructive" className="text-xs">
                      {field.replace('_', ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

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
