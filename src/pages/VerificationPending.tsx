import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function VerificationPending() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [verificationStatus, setVerificationStatus] = useState<string>("pending");
  const [loading, setLoading] = useState(true);

  // SEO
  useEffect(() => {
    document.title = "Verification Pending | Cash Ridez";
    const desc = "We received your ID submission. We'll review and notify you shortly.";
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);
  }, []);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    checkVerificationStatus();

    // Subscribe to profile changes to detect verification updates
    const channel = supabase
      .channel("profile-verification-changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const newStatus = payload.new.verification_status;
          if (newStatus === "approved") {
            toast({
              title: "Account Verified!",
              description: "Your account has been successfully verified. Redirecting to dashboard...",
            });
            setTimeout(() => navigate("/dashboard"), 2000);
          } else if (newStatus === "rejected") {
            toast({
              title: "Verification Update",
              description: "Please check your notifications for details.",
              variant: "destructive",
            });
            setTimeout(() => navigate("/onboarding"), 2000);
          }
          setVerificationStatus(newStatus);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, navigate, toast]);

  const checkVerificationStatus = async () => {
    if (!user) return;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("verification_status, is_verified")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("Error fetching profile:", error);
      setLoading(false);
      return;
    }

    if (profile.is_verified || profile.verification_status === "approved") {
      navigate("/dashboard");
      return;
    }

    if (profile.verification_status === "rejected") {
      navigate("/onboarding");
      return;
    }

    setVerificationStatus(profile.verification_status || "pending");
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <CheckCircle className="w-6 h-6 text-primary absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
            </div>
          </div>
          <CardTitle className="text-2xl">ID Verification Submitted</CardTitle>
          <CardDescription className="text-base">
            Thank you for submitting your ID for verification
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Video Section */}
          <div className="relative rounded-lg overflow-hidden bg-muted">
            <video
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-auto"
              src="/verification-intro.mp4"
            >
              Your browser does not support the video tag.
            </video>
          </div>

          {/* Information Section */}
          <div className="bg-muted/50 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-lg">What happens next?</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="font-semibold text-primary mt-0.5">1.</span>
                <span>Our team is currently reviewing your ID submission</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-semibold text-primary mt-0.5">2.</span>
                <span>You'll receive a notification once your verification status is updated</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-semibold text-primary mt-0.5">3.</span>
                <span>This typically takes just a few moments. For speedy responses and to check current wait times, click the support icon in the bottom left corner—an available team member will respond quickly.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-semibold text-primary mt-0.5">4.</span>
                <span>Once verified, you'll be able to post and accept ride requests</span>
              </li>
            </ul>
          </div>

          <div className="text-center text-sm text-muted-foreground">
            <p>You'll be automatically redirected once your account is verified.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
