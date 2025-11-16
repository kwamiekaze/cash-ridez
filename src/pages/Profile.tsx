import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Camera, Star, CheckCircle, Clock, XCircle, Car } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { UserRatingsDisplay } from "@/components/UserRatingsDisplay";
import AppHeader from "@/components/AppHeader";
import { ImageCropDialog } from "@/components/ImageCropDialog";
import { CancellationBadge } from "@/components/CancellationBadge";
import { NotificationPreferences } from "@/components/NotificationPreferences";
import { RiderZipEditor } from "@/components/RiderZipEditor";

import { MapBackground } from "@/components/MapBackground";

const Profile = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [profile, setProfile] = useState({
    full_name: "",
    email: "",
    phone_number: "",
    bio: "",
    photo_url: "",
    rider_rating_avg: 0,
    rider_rating_count: 0,
    driver_rating_avg: 0,
    driver_rating_count: 0,
    is_rider: false,
    is_driver: false,
    is_verified: false,
    verification_status: "pending",
    created_at: "",
    car_year: "",
    car_make: "",
    car_model: "",
  });
  const [adminLockedFields, setAdminLockedFields] = useState<string[]>([]);
  const [originalName, setOriginalName] = useState("");

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Profile fetch error:", error);
        toast({
          title: "Error",
          description: "Failed to load profile",
          variant: "destructive",
        });
        return;
      }

      if (data) {
        setProfile({
          full_name: data.full_name || "",
          email: data.email || "",
          phone_number: data.phone_number || "",
          bio: data.bio || "",
          photo_url: data.photo_url || "",
          rider_rating_avg: data.rider_rating_avg || 0,
          rider_rating_count: data.rider_rating_count || 0,
          driver_rating_avg: data.driver_rating_avg || 0,
          driver_rating_count: data.driver_rating_count || 0,
          is_rider: data.is_rider || false,
          is_driver: data.is_driver || false,
          is_verified: data.is_verified || false,
          verification_status: data.verification_status || "pending",
          created_at: data.created_at || "",
          car_year: data.car_year || "",
          car_make: data.car_make || "",
          car_model: data.car_model || "",
        });
        setAdminLockedFields(data.admin_locked_fields || []);
        setOriginalName(data.full_name || "");
      }
    };

    fetchProfile();
  }, [user, toast]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "File size must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({
        title: "Error",
        description: "Only JPG, PNG, and WebP images are allowed",
        variant: "destructive",
      });
      return;
    }

    // Create image URL for cropping
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
      setCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    if (!user) return;

    setUploading(true);
    try {
      const fileExt = "jpg";
      const filePath = `${user.id}/profile.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-pictures")
        .upload(filePath, croppedBlob, { upsert: true, contentType: "image/jpeg" });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("profile-pictures")
        .getPublicUrl(filePath);

      setProfile({ ...profile, photo_url: publicUrl });

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ photo_url: publicUrl })
        .eq("id", user.id);

      if (updateError) {
        console.error("Update error:", updateError);
        throw updateError;
      }

      toast({
        title: "Success",
        description: "Photo uploaded successfully",
      });
    } catch (error: any) {
      console.error("Photo upload error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to upload photo",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setSelectedImage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Prepare update object with only non-locked fields
    const updates: any = {};
    
    // Check if full_name is admin-locked
    if (adminLockedFields.includes('full_name')) {
      // Use original admin-set name
      updates.full_name = originalName;
      if (profile.full_name !== originalName) {
        toast({
          title: "Name Protected",
          description: "Your name has been set by an admin and cannot be changed. Other changes have been saved.",
          variant: "default",
        });
      }
    } else {
      // Validate full name - only allow letters, spaces, hyphens, apostrophes, and periods
      if (profile.full_name && !/^[a-zA-Z\s'\-\.]+$/.test(profile.full_name)) {
        toast({
          title: "Invalid Name",
          description: "Full name can only contain letters, spaces, hyphens, apostrophes, and periods",
          variant: "destructive",
        });
        return;
      }
      updates.full_name = profile.full_name;
      updates.display_name = profile.full_name;
    }

    // Add other fields (these can always be updated by the user)
    updates.phone_number = profile.phone_number;
    updates.bio = profile.bio;
    
    // Add vehicle information if user is a driver
    if (profile.is_driver) {
      updates.car_year = profile.car_year;
      updates.car_make = profile.car_make;
      updates.car_model = profile.car_model;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getInitials = () => {
    if (profile.full_name) {
      return profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return profile.email.slice(0, 2).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-background relative">
      {/* Animated Map Background */}
      <MapBackground showAnimatedCar showRiders intensity="subtle" className="fixed inset-0 z-0" />
      
      <div className="relative z-10">
        <AppHeader />
        <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <Card className="p-6">
          <h1 className="text-2xl font-bold mb-6">Profile</h1>

          {/* Privacy Notice */}
          <div className="mb-6 p-4 bg-muted/50 rounded-lg border border-border">
            <p className="text-sm text-muted-foreground">
              <strong>Privacy Note:</strong> Only your name, bio, and profile picture are visible to other users. Your contact information and email remain private.
            </p>
          </div>

          {/* Account Information */}
          <div className="mb-6 space-y-4">
            <h2 className="text-lg font-semibold">Account Information</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="p-4">
                <p className="text-sm text-muted-foreground mb-1">User ID</p>
                <div className="font-mono text-xs break-all bg-muted px-2 py-1 rounded">
                  {user?.id}
                </div>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-muted-foreground mb-1">Account Status</p>
                <div className="flex items-center gap-2">
                  {profile.is_verified ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-success" />
                      <span className="font-medium text-success">Verified</span>
                    </>
                  ) : profile.verification_status === "pending" ? (
                    <>
                      <Clock className="w-5 h-5 text-warning" />
                      <span className="font-medium text-warning">Pending Verification</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-destructive" />
                      <span className="font-medium text-destructive">Not Verified</span>
                    </>
                  )}
                </div>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-muted-foreground mb-1">Member Since</p>
                <span className="font-medium">
                  {profile.created_at ? format(new Date(profile.created_at), "MMMM d, yyyy") : "N/A"}
                </span>
              </Card>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Photo Upload */}
            <div className="flex flex-col items-center gap-4">
              <Avatar className="w-32 h-32">
                <AvatarImage src={profile.photo_url} />
                <AvatarFallback className="text-2xl">{getInitials()}</AvatarFallback>
              </Avatar>
              <div>
                <Label htmlFor="photo-upload" className="cursor-pointer">
                  <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
                    <Camera className="w-4 h-4" />
                    {uploading ? "Uploading..." : "Upload Photo"}
                  </div>
                  <Input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoSelect}
                    disabled={uploading}
                  />
                </Label>
              </div>
            </div>

            {/* Rating Display */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="p-4">
                <p className="text-sm text-muted-foreground mb-2">Cancellation Rate</p>
                <CancellationBadge userId={user.id} role="both" size="md" showIcon={true} />
              </Card>
              {(profile.is_rider || profile.is_driver) && (
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground mb-2">User Rating</p>
                  {(profile.rider_rating_count > 0 || profile.driver_rating_count > 0) ? (
                    <div className="space-y-2">
                      {profile.is_rider && profile.rider_rating_count > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Rider:</span>
                          <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            <span className="font-medium">{profile.rider_rating_avg.toFixed(1)}</span>
                            <span className="text-xs text-muted-foreground">({profile.rider_rating_count})</span>
                          </div>
                        </div>
                      )}
                      {profile.is_driver && profile.driver_rating_count > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Driver:</span>
                          <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            <span className="font-medium">{profile.driver_rating_avg.toFixed(1)}</span>
                            <span className="text-xs text-muted-foreground">({profile.driver_rating_count})</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No ratings yet</p>
                  )}
                </Card>
              )}
            </div>

            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="full_name">
                Full Name (Legal Full Name)
                {adminLockedFields.includes('full_name') && (
                  <span className="ml-2 text-xs text-warning">(Admin Protected)</span>
                )}
              </Label>
              <Input
                id="full_name"
                value={profile.full_name}
                onChange={(e) => {
                  const value = e.target.value;
                  // Only allow letters, spaces, hyphens, apostrophes, and periods
                  if (value === '' || /^[a-zA-Z\s'\-\.]+$/.test(value)) {
                    setProfile({ ...profile, full_name: value });
                  }
                }}
                placeholder="Enter your full name"
                disabled={adminLockedFields.includes('full_name')}
                className={adminLockedFields.includes('full_name') ? 'bg-muted cursor-not-allowed' : ''}
              />
              {adminLockedFields.includes('full_name') ? (
                <p className="text-xs text-muted-foreground bg-warning/10 p-2 rounded border border-warning/20">
                  This field has been set by an admin and cannot be modified.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Letters, spaces, hyphens, apostrophes, and periods only</p>
              )}
            </div>

            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                value={profile.email}
                disabled
                className="bg-muted"
              />
            </div>

            {/* Phone Number */}
            <div className="space-y-2">
              <Label htmlFor="phone_number">Contact Number</Label>
              <Input
                id="phone_number"
                type="tel"
                value={profile.phone_number}
                onChange={(e) => setProfile({ ...profile, phone_number: e.target.value })}
                placeholder="Enter your phone number"
              />
            </div>

            {/* Bio */}
            <div className="space-y-2">
              <Label htmlFor="bio">Short Bio</Label>
              <Textarea
                id="bio"
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                placeholder="Tell us a bit about yourself"
                rows={4}
              />
              <p className="text-sm text-muted-foreground mt-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <strong className="text-destructive">Warning:</strong> Do not include contact information (phone numbers, email, social media handles, etc.) in your bio. Sharing contact information may result in account suspension. Multiple violations may result in account termination.
              </p>
            </div>

            {/* Driver Vehicle Information */}
            {profile.is_driver && (
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Car className="h-5 w-5" />
                  <h3 className="font-semibold">Vehicle Information</h3>
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="car_year">Year</Label>
                    <Input
                      id="car_year"
                      value={profile.car_year || ''}
                      onChange={(e) => setProfile({ ...profile, car_year: e.target.value })}
                      placeholder="2020"
                      maxLength={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="car_make">Make</Label>
                    <Input
                      id="car_make"
                      value={profile.car_make || ''}
                      onChange={(e) => setProfile({ ...profile, car_make: e.target.value })}
                      placeholder="Toyota"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="car_model">Model</Label>
                    <Input
                      id="car_model"
                      value={profile.car_model || ''}
                      onChange={(e) => setProfile({ ...profile, car_model: e.target.value })}
                      placeholder="Camry"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Vehicle information will be visible to riders for transparency and safety.
                </p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </Card>

        {/* Role-specific sections */}
        {user && (
          <div className="mt-6 space-y-6">
            {/* Rider ZIP Editor */}
            {profile.is_rider && <RiderZipEditor />}
            
            {/* Individual Ratings Display */}
            {profile.is_rider && profile.rider_rating_count > 0 && (
              <UserRatingsDisplay userId={user.id} ratingType="rider" />
            )}
            {profile.is_driver && profile.driver_rating_count > 0 && (
              <UserRatingsDisplay userId={user.id} ratingType="driver" />
            )}
            
            {/* Notification Preferences */}
            <NotificationPreferences />
          </div>
        )}
      </div>

      {/* Image Crop Dialog */}
      {selectedImage && (
        <ImageCropDialog
          open={cropDialogOpen}
          onOpenChange={setCropDialogOpen}
          imageSrc={selectedImage}
          onCropComplete={handleCropComplete}
        />
      )}
      </div>
    </div>
  );
};

export default Profile;
