import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Car, Users, Upload, CheckCircle } from "lucide-react";

const Onboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isRider, setIsRider] = useState(false);
  const [isDriver, setIsDriver] = useState(false);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

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
    if (!isRider && !isDriver) {
      toast.error("Please select at least one role");
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

      const {
        data: { publicUrl },
      } = supabase.storage.from("id-verifications").getPublicUrl(filePath);

      // Update profile with roles and ID
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          is_rider: isRider,
          is_driver: isDriver,
          id_image_url: publicUrl,
          verification_status: "pending",
          verification_submitted_at: new Date().toISOString(),
        })
        .eq("id", user?.id);

      if (updateError) throw updateError;

      toast.success("Profile submitted for verification!");
      navigate("/dashboard");
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message || "Failed to submit");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome to Cash Ridez!</h1>
          <p className="text-muted-foreground">Let's set up your account</p>
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">Choose Your Role(s)</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Card
                className={`p-6 cursor-pointer transition-all hover:shadow-lg ${
                  isRider ? "border-primary bg-primary/5" : ""
                }`}
                onClick={() => setIsRider(!isRider)}
              >
                <div className="flex items-start gap-4">
                  <Checkbox checked={isRider} onChange={() => setIsRider(!isRider)} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold">I'm a Rider</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Request rides and connect with drivers
                    </p>
                  </div>
                </div>
              </Card>

              <Card
                className={`p-6 cursor-pointer transition-all hover:shadow-lg ${
                  isDriver ? "border-primary bg-primary/5" : ""
                }`}
                onClick={() => setIsDriver(!isDriver)}
              >
                <div className="flex items-start gap-4">
                  <Checkbox checked={isDriver} onChange={() => setIsDriver(!isDriver)} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Car className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold">I'm a Driver</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Accept ride requests and earn money
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4">Upload ID for Verification</h2>
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
              Your ID will be reviewed by our team. Only verified users can create or accept rides.
            </p>
          </div>

          <Button
            className="w-full bg-gradient-primary"
            size="lg"
            onClick={handleSubmit}
            disabled={uploading || !idFile || (!isRider && !isDriver)}
          >
            {uploading ? "Submitting..." : "Submit for Verification"}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default Onboarding;
