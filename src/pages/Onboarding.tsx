import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Car, Upload, CheckCircle, Loader2, User, LogOut, XCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RolePicker } from "@/components/RolePicker";

const Onboarding = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [idFile, setIdFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState<'rider' | 'driver' | null>(null);

  useEffect(() => {
    const checkVerification = async () => {
      if (!user) return;
      
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      
      if (profileData) {
        setProfile(profileData);
        if (profileData.is_verified || profileData.verification_status === "approved") {
          setIsVerified(true);
        }
      }
      setLoading(false);
    };
    
    checkVerification();
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size must be less than 5MB");
        return;
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        toast.error("Only JPG, PNG, and WebP images are allowed");
        return;
      }
      setIdFile(file);
    }
  };

  const handleSubmit = async () => {
    if (!selectedRole) {
      toast.error("Please select your role");
      return;
    }

    if (!idFile) {
      toast.error("Please upload your ID photo");
      return;
    }

    setUploading(true);

    try {
      // Upload ID image
      const fileExt = idFile.name.split(".").pop();
      const filePath = `${user?.id}/id-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("id-verifications")
        .upload(filePath, idFile);

      if (uploadError) throw uploadError;

      // Generate signed URL with 1-hour expiry for security
      const {
        data: { signedUrl },
        error: urlError,
      } = await supabase.storage
        .from("id-verifications")
        .createSignedUrl(filePath, 3600);

      if (urlError) throw urlError;

      // Update profile with ID and role
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          id_image_url: filePath,
          verification_status: "pending",
          verification_submitted_at: new Date().toISOString(),
          active_role: selectedRole,
          role_set_at: new Date().toISOString(),
          is_rider: selectedRole === 'rider',
          is_driver: selectedRole === 'driver',
        })
        .eq("id", user?.id);

      if (updateError) throw updateError;

      // Create KYC submission record
      await supabase
        .from("kyc_submissions")
        .insert({
          user_id: user?.id,
          user_email: user?.email || '',
          role: selectedRole,
          front_image_url: filePath,
          status: 'pending',
        });

      if (updateError) throw updateError;

      // Send notification emails
      try {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("display_name, is_rider, is_driver")
          .eq("id", user?.id)
          .single();

        await supabase.functions.invoke("send-verification-notification", {
          body: {
            userId: user?.id,
            userEmail: user?.email,
            displayName: profileData?.display_name || user?.email,
            isRider: profileData?.is_rider || false,
            isDriver: profileData?.is_driver || false,
            filePath, // include storage path so backend can create a signed URL for admins
          },
        });
      } catch (emailError) {
        console.error("Error sending notification:", emailError);
        // Don't fail the whole process if email fails
      }

      toast.success("ID submitted for verification!");
      toast.info(
        "Our team will review your submission shortly. You'll be notified once your account is verified.",
        { duration: 6000 }
      );
      navigate("/verification-pending");
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message || "Failed to submit");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with user dropdown */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Car className="w-6 h-6 text-primary" />
            <span className="text-xl font-bold">Cash Ridez</span>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar>
                  <AvatarImage src={profile?.photo_url} alt={profile?.display_name || user?.email} />
                  <AvatarFallback>
                    {profile?.display_name?.[0] || user?.email?.[0] || "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {profile?.display_name || "User"}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-col items-center justify-center p-4 min-h-[calc(100vh-4rem)]">
        <div className="text-center mb-6 max-w-2xl w-full">
          <h1 className="text-4xl font-bold mb-6">Welcome to Cash Ridez!</h1>
        </div>

        <Card className="max-w-2xl w-full p-8">
          {/* Video Section */}
          <div className="relative rounded-lg overflow-hidden bg-muted mb-6">
            <video
              preload="metadata"
              muted
              playsInline
              className="w-full h-auto"
              src="/onboarding-intro.mov"
              controls
            >
              Your browser does not support the video tag.
            </video>
          </div>

          <div className="text-center mb-8">
            <p className="text-2xl font-semibold text-primary">Let's set up your account</p>
          </div>

        <div className="space-y-6">
          {isVerified ? (
            <div>
              <h2 className="text-xl font-semibold mb-4">Account Status</h2>
              <Card className="p-6 border-primary bg-primary/5">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
                    <CheckCircle className="w-10 h-10 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-2">Verified User</h3>
                    <p className="text-foreground/70">
                      Your account has been verified. You can now access all platform features.
                    </p>
                  </div>
                  <Button
                    className="w-full bg-gradient-primary mt-4"
                    size="lg"
                    onClick={() => navigate("/dashboard")}
                  >
                    Go to Dashboard
                  </Button>
                </div>
              </Card>
            </div>
          ) : profile?.verification_status === "pending" && profile?.id_image_url ? (
            <div>
              <h2 className="text-xl font-semibold mb-4">Verification Status</h2>
              <Card className="p-6 border-warning bg-warning/5">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="w-16 h-16 rounded-full bg-warning flex items-center justify-center">
                    <Upload className="w-10 h-10 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-warning mb-2">Verification Pending</h3>
                    <p className="text-foreground/70 mb-4">
                      Your ID is currently being reviewed. You'll receive an email once the review is complete.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Need to update your submission? You can resubmit below.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full mt-4"
                    onClick={() => navigate("/profile")}
                  >
                    Complete Your Profile
                  </Button>
                </div>
              </Card>

              <Card className="p-6 bg-primary/5 border-primary mt-6">
                <div className="space-y-2">
                  <h3 className="font-semibold text-foreground">Complete Your Profile</h3>
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    While your ID is being reviewed, please take a moment to update your <span className="font-medium">Full Name</span>, <span className="font-medium">Contact Information</span>, and <span className="font-medium">Emergency Contact</span> on your profile. This information helps cashridez.com staff and your future connected drivers and riders coordinate with you efficiently and safely.
                  </p>
                  <p className="text-xs text-muted-foreground pt-2">
                    Your personal information is securely stored and only shared with verified users you connect with through trip assignments.
                  </p>
                </div>
              </Card>
              
              <div className="mt-6">
                <h2 className="text-xl font-semibold mb-4">Resubmit ID</h2>
                <Card className="p-6">
                  <Label htmlFor="id-upload" className="cursor-pointer">
                    <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors">
                      {idFile ? (
                        <div className="flex flex-col items-center gap-2">
                          <CheckCircle className="w-12 h-12 text-success" />
                          <p className="font-medium">{idFile.name}</p>
                          <p className="text-sm text-muted-foreground">Click to change</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Upload className="w-12 h-12 text-muted-foreground" />
                          <p className="font-medium">Upload New Government-Issued ID</p>
                          <p className="text-sm text-muted-foreground">
                            JPG, PNG, or WebP (Max 5MB)
                          </p>
                        </div>
                      )}
                    </div>
                    <input
                      id="id-upload"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </Label>
                </Card>
              </div>
            </div>
          ) : profile?.verification_status === "rejected" ? (
            <div>
              <h2 className="text-xl font-semibold mb-4">Verification Status</h2>
              <Card className="p-6 border-destructive bg-destructive/5">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center">
                    <XCircle className="w-10 h-10 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-destructive mb-2">Verification Not Approved</h3>
                    <p className="text-foreground/70 mb-4">
                      Your previous ID submission could not be verified. This may be due to image quality or document type.
                    </p>
                    <p className="text-sm font-medium">
                      Please submit a clear photo of your government-issued ID below.
                    </p>
                  </div>
                </div>
              </Card>
              
              <div className="mt-6">
                <h2 className="text-xl font-semibold mb-4">Resubmit ID for Verification</h2>
                <Card className="p-6">
                  <Label htmlFor="id-upload" className="cursor-pointer">
                    <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors">
                      {idFile ? (
                        <div className="flex flex-col items-center gap-2">
                          <CheckCircle className="w-12 h-12 text-success" />
                          <p className="font-medium">{idFile.name}</p>
                          <p className="text-sm text-muted-foreground">Click to change</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Upload className="w-12 h-12 text-muted-foreground" />
                          <p className="font-medium">Upload Government-Issued ID</p>
                          <p className="text-sm text-muted-foreground">
                            JPG, PNG, or WebP (Max 5MB)
                          </p>
                        </div>
                      )}
                    </div>
                    <input
                      id="id-upload"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </Label>
                </Card>
                <p className="text-xs text-muted-foreground mt-2">
                  Ensure your ID is clearly visible, well-lit, and all information is readable.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-semibold mb-4">Account Verification Required</h2>
              
              {/* Role Selection */}
              <Card className="p-6 mb-6">
                <RolePicker
                  onRoleSelect={setSelectedRole}
                  selectedRole={selectedRole}
                />
              </Card>
              <Card className="p-6 bg-primary/5 border-primary mb-6">
                <div className="space-y-3">
                  <p className="text-foreground/90 leading-relaxed">
                    To ensure the safety and trustworthiness of our community, we require all users to verify their identity. 
                    Please upload a clear photo of your <span className="font-semibold">unexpired driver's license, state ID card, or permit</span>.
                  </p>
                  <div className="pt-2 space-y-2 text-sm text-foreground/70">
                    <p className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                      <span>Your ID will only be shared with cashridez.com staff for verification purposes</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                      <span>Your ID will never be displayed publicly or shared with other users</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                      <span>This verification process helps us maintain a safe and trustworthy community</span>
                    </p>
                  </div>
                </div>
              </Card>
              
              <h2 className="text-xl font-semibold mb-4">Upload Your ID</h2>
              <Card className="p-6">
                <Label htmlFor="id-upload" className="cursor-pointer">
                  <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors">
                    {idFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle className="w-12 h-12 text-success" />
                        <p className="font-medium">{idFile.name}</p>
                        <p className="text-sm text-muted-foreground">Click to change</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="w-12 h-12 text-muted-foreground" />
                        <p className="font-medium">Upload Government-Issued ID</p>
                        <p className="text-sm text-muted-foreground">
                          JPG, PNG, or WebP (Max 5MB)
                        </p>
                      </div>
                    )}
                  </div>
                  <input
                    id="id-upload"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </Label>
              </Card>
              <p className="text-xs text-muted-foreground mt-2">
                Your ID will be reviewed by our team. Only verified users can post or connect with trip requests.
              </p>
            </div>
          )}

          {!isVerified && (
            <>
              <Button
                className="w-full bg-gradient-primary"
                size="lg"
                onClick={handleSubmit}
                disabled={uploading || !idFile || !selectedRole}
              >
                {uploading ? "Submitting..." : profile?.id_image_url ? "Resubmit for Verification" : "Submit for Verification"}
              </Button>
              {!selectedRole && (
                <p className="text-sm text-destructive text-center mt-2">
                  Please select your role before submitting
                </p>
              )}
            </>
          )}
        </div>
        </Card>
      </div>
    </div>
  );
};

export default Onboarding;
