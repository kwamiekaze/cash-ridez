import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { ExternalLink, Users, Mail, Shield, Key, LogOut, Eye, EyeOff } from "lucide-react";
import { RatingDisplay } from "@/components/RatingDisplay";
import { CancellationBadge } from "@/components/CancellationBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { validatePassword, getPasswordRequirementsText } from "@/lib/passwordValidation";

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
  const [sendingEmail, setSendingEmail] = useState(false);
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
  const [idPreviewUrl, setIdPreviewUrl] = useState<string | null>(null);
  const [idPreviewOpen, setIdPreviewOpen] = useState(false);
  const [referralStats, setReferralStats] = useState<{ count: number; referrerName: string | null; referralCode: string | null; totalReferredTrips: number }>({ count: 0, referrerName: null, referralCode: null, totalReferredTrips: 0 });
  
  // Security section state
  const [sendingResetEmail, setSendingResetEmail] = useState(false);
  const [settingTempPassword, setSettingTempPassword] = useState(false);
  const [revokingSessions, setRevokingSessions] = useState(false);
  const [tempPassword, setTempPassword] = useState("");
  const [showTempPassword, setShowTempPassword] = useState(false);
  const [revokeOnReset, setRevokeOnReset] = useState(true);
  const [confirmResetEmailOpen, setConfirmResetEmailOpen] = useState(false);
  const [confirmTempPasswordOpen, setConfirmTempPasswordOpen] = useState(false);
  const [confirmRevokeSessionsOpen, setConfirmRevokeSessionsOpen] = useState(false);

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
      
      // Fetch referral stats
      const { data: referrals } = await supabase
        .from("referrals")
        .select("referred_user_id")
        .eq("referrer_user_id", userId);
      
      let referrerName = null;
      let totalReferredTrips = 0;
      
      if (data.referred_by_user_id) {
        const { data: referrer } = await supabase
          .from("profiles")
          .select("full_name, display_name, email")
          .eq("id", data.referred_by_user_id)
          .single();
        if (referrer) {
          referrerName = referrer.full_name || referrer.display_name || referrer.email;
        }
      }
      
      // Calculate total trips from referred users
      if (referrals && referrals.length > 0) {
        const referredIds = referrals.map(r => r.referred_user_id);
        const { data: referredProfiles } = await supabase
          .from("profiles")
          .select("completed_trips_count")
          .in("id", referredIds);
        
        if (referredProfiles) {
          totalReferredTrips = referredProfiles.reduce((sum, p) => sum + (p.completed_trips_count || 0), 0);
        }
      }
      
      setReferralStats({ 
        count: referrals?.length || 0, 
        referrerName, 
        referralCode: data.referral_code,
        totalReferredTrips
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

  const handleRejectVerification = async () => {
    if (!userId) return;

    setSaving(true);
    try {
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
      fetchUserDetails(); // Refresh the user data
    } catch (error: any) {
      toast.error("Failed to reject verification");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleResendWelcomeEmail = async () => {
    if (!userId || !user) return;

    setSendingEmail(true);
    try {
      const firstName = user.full_name?.split(' ')[0] || user.display_name || 'there';
      
      const { data, error } = await supabase.functions.invoke("send-verification-welcome-email", {
        body: {
          userId: user.id,
          userEmail: user.email,
          firstName,
          isDriver: user.is_driver || false,
          isRider: user.is_rider || false,
          forceResend: true, // Always force resend when clicking the button
        },
      });

      if (error) throw error;

      // Check response for actual success
      if (data?.success) {
        toast.success("Welcome email sent successfully");
      } else if (data?.error) {
        toast.error(`Failed: ${data.error}`);
      } else {
        toast.error("Failed to send email - unknown error");
      }
    } catch (error: any) {
      console.error("Error sending welcome email:", error);
      toast.error(`Failed to send welcome email: ${error.message || 'Unknown error'}`);
    } finally {
      setSendingEmail(false);
    }
  };

  // Security action handlers
  const handleSendResetEmail = async () => {
    if (!userId) return;
    setConfirmResetEmailOpen(false);
    setSendingResetEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-password-reset", {
        body: {
          action: "send_reset_email",
          targetUserId: userId,
        },
      });

      if (error) throw error;
      if (data?.success) {
        toast.success(data.message || "Password reset email sent");
      } else {
        toast.error(data?.error || "Failed to send reset email");
      }
    } catch (error: any) {
      console.error("Error sending reset email:", error);
      toast.error(error.message || "Failed to send password reset email");
    } finally {
      setSendingResetEmail(false);
    }
  };

  const handleSetTempPassword = async () => {
    if (!userId || !tempPassword) return;
    
    // Validate password using shared utility
    const validation = validatePassword(tempPassword);
    if (!validation.isValid) {
      toast.error(validation.errors[0]);
      return;
    }

    setConfirmTempPasswordOpen(false);
    setSettingTempPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-password-reset", {
        body: {
          action: "set_temp_password",
          targetUserId: userId,
          tempPassword,
          revokeSessionsOnReset: revokeOnReset,
        },
      });

      if (error) throw error;
      if (data?.success) {
        toast.success(data.message || "Temporary password set");
        setTempPassword("");
      } else {
        toast.error(data?.error || "Failed to set temporary password");
      }
    } catch (error: any) {
      console.error("Error setting temp password:", error);
      toast.error(error.message || "Failed to set temporary password");
    } finally {
      setSettingTempPassword(false);
    }
  };

  const handleRevokeSessions = async () => {
    if (!userId) return;
    setConfirmRevokeSessionsOpen(false);
    setRevokingSessions(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-password-reset", {
        body: {
          action: "revoke_sessions",
          targetUserId: userId,
        },
      });

      if (error) throw error;
      if (data?.success) {
        toast.success(data.message || "All sessions revoked");
      } else {
        toast.error(data?.error || "Failed to revoke sessions");
      }
    } catch (error: any) {
      console.error("Error revoking sessions:", error);
      toast.error(error.message || "Failed to revoke sessions");
    } finally {
      setRevokingSessions(false);
    }
  };

  const generateTempPassword = () => {
    // Generate a strong password that meets the policy (min 8 chars)
    const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const symbols = "!@#$%^&*";
    let password = "";
    // Generate 10 chars for a secure temp password
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Shuffle the password
    setTempPassword(password.split("").sort(() => Math.random() - 0.5).join(""));
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

          {/* Referral Info */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4" />
              <Label className="text-sm font-medium">Referral Information</Label>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Referred By:</span>
                <span className={referralStats.referrerName ? "text-primary" : "text-muted-foreground"}>
                  {referralStats.referrerName || "Not referred"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Referrals:</span>
                <Badge variant="secondary">{referralStats.count}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Trips by Referrals:</span>
                <Badge variant="secondary" className="bg-primary/20 text-primary">{referralStats.totalReferredTrips}</Badge>
              </div>
              {referralStats.referralCode && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Referral Code:</span>
                  <code className="text-xs bg-muted px-2 py-1 rounded">{referralStats.referralCode}</code>
                </div>
              )}
            </div>
          </Card>

          {/* ID Verification */}
          {user.id_image_url && (
            <Card className="p-4">
              <Label className="text-sm font-medium mb-2 block">ID Verification Image</Label>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const { data, error } = await supabase.storage
                        .from('id-verifications')
                        .createSignedUrl(user.id_image_url, 3600);
                      if (error) throw error;
                      if (data?.signedUrl) {
                        setIdPreviewUrl(data.signedUrl);
                        setIdPreviewOpen(true);
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
                {!user.is_verified && user.verification_status === "pending" && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRejectVerification}
                    disabled={saving}
                  >
                    Reject ID
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* Admin Email Actions */}
          {user.verification_status === "approved" && (
            <Card className="p-4">
              <Label className="text-sm font-medium mb-2 block">Email Actions</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResendWelcomeEmail}
                disabled={sendingEmail}
              >
                <Mail className="h-4 w-4 mr-2" />
                {sendingEmail ? "Sending..." : "Resend Welcome Email"}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Send the verification welcome email again to this user
              </p>
            </Card>
          )}

          {/* Security Section */}
          <Card className="p-4 border-destructive/20">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-4 w-4 text-destructive" />
              <Label className="text-sm font-medium">Security</Label>
            </div>
            <div className="space-y-4">
              {/* Send Password Reset Email */}
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmResetEmailOpen(true)}
                  disabled={sendingResetEmail}
                  className="w-full justify-start"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  {sendingResetEmail ? "Sending..." : "Send Password Reset Email"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Sends a password reset link to {user.email}
                </p>
              </div>

              {/* Set Temporary Password */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Set Temporary Password</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showTempPassword ? "text" : "password"}
                      placeholder={getPasswordRequirementsText()}
                      value={tempPassword}
                      onChange={(e) => setTempPassword(e.target.value)}
                      className={`pr-10 ${tempPassword && !validatePassword(tempPassword).isValid ? 'border-destructive' : ''}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowTempPassword(!showTempPassword)}
                    >
                      {showTempPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateTempPassword}
                    className="shrink-0"
                  >
                    Generate
                  </Button>
                </div>
                {/* Inline validation feedback */}
                {tempPassword && !validatePassword(tempPassword).isValid && (
                  <p className="text-xs text-destructive">
                    {validatePassword(tempPassword).errors[0]}
                  </p>
                )}
                {tempPassword && validatePassword(tempPassword).isValid && (
                  <p className="text-xs text-green-500">
                    Password meets requirements
                  </p>
                )}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="revoke-sessions"
                    checked={revokeOnReset}
                    onCheckedChange={(checked) => setRevokeOnReset(checked === true)}
                  />
                  <label
                    htmlFor="revoke-sessions"
                    className="text-xs text-muted-foreground cursor-pointer"
                  >
                    Revoke all sessions after setting password
                  </label>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmTempPasswordOpen(true)}
                  disabled={settingTempPassword || !tempPassword || !validatePassword(tempPassword).isValid}
                  className="w-full justify-start"
                >
                  <Key className="h-4 w-4 mr-2" />
                  {settingTempPassword ? "Setting..." : "Set Temporary Password"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  User will be required to change password on next login
                </p>
              </div>

              {/* Revoke Sessions */}
              <div className="space-y-2 pt-2 border-t">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmRevokeSessionsOpen(true)}
                  disabled={revokingSessions}
                  className="w-full justify-start"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  {revokingSessions ? "Revoking..." : "Revoke All Sessions"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Signs the user out of all devices immediately
                </p>
              </div>
            </div>
          </Card>

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

      {/* ID Image Preview Dialog */}
      <Dialog open={idPreviewOpen} onOpenChange={setIdPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <div className="relative w-full h-full p-4">
            <img 
              src={idPreviewUrl || ''} 
              alt="ID Verification" 
              className="max-w-full max-h-[85vh] object-contain rounded mx-auto" 
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Send Reset Email Dialog */}
      <AlertDialog open={confirmResetEmailOpen} onOpenChange={setConfirmResetEmailOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Password Reset Email</AlertDialogTitle>
            <AlertDialogDescription>
              This will send a password reset link to <strong>{user?.email}</strong>. 
              The user will be able to set a new password using this link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSendResetEmail}>
              Send Reset Email
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Set Temp Password Dialog */}
      <AlertDialog open={confirmTempPasswordOpen} onOpenChange={setConfirmTempPasswordOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set Temporary Password</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This will set a temporary password for <strong>{user?.email}</strong>.
              </p>
              <p>
                The user will be required to change their password on next login.
              </p>
              {revokeOnReset && (
                <p className="text-destructive">
                  All active sessions will be revoked.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSetTempPassword}>
              Set Temporary Password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Revoke Sessions Dialog */}
      <AlertDialog open={confirmRevokeSessionsOpen} onOpenChange={setConfirmRevokeSessionsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke All Sessions</AlertDialogTitle>
            <AlertDialogDescription>
              This will sign <strong>{user?.email}</strong> out of all devices immediately. 
              They will need to log in again to access their account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevokeSessions} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Revoke All Sessions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
