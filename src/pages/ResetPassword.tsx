import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { MapBackground } from "@/components/MapBackground";

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

const ResetPassword = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValidLink, setIsValidLink] = useState(false);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  useEffect(() => {
    const validateResetLink = async () => {
      try {
        // Check if we have a valid session from the email link
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !session) {
          setIsValidLink(false);
        } else {
          setIsValidLink(true);
        }
      } catch (error) {
        console.error("Error validating reset link:", error);
        setIsValidLink(false);
      } finally {
        setIsValidating(false);
      }
    };

    validateResetLink();
  }, []);

  const onSubmit = async (data: ResetPasswordFormData) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: data.newPassword,
      });

      if (error) throw error;

      toast.success("Your password has been updated.");
      setSuccess(true);
      
      // Redirect to sign in after 2 seconds
      setTimeout(() => {
        navigate("/auth");
      }, 2000);
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/5">
        <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-background via-background to-accent/5">
      <MapBackground showAnimatedCar showRiders intensity="prominent" className="absolute inset-0 z-0 pointer-events-none" />
      
      {/* Background Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-emerald-950/40 to-black/80 z-0" />
      
      <div className="w-full max-w-md relative z-10 px-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-3 mb-4">
            <span 
              className="font-bold bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-400 bg-clip-text text-transparent text-5xl animate-shimmer bg-[length:200%_auto]" 
              style={{
                fontFamily: "'Playfair Display', serif",
                filter: 'drop-shadow(0 0 20px rgba(250,204,21,0.9)) drop-shadow(0 0 40px rgba(250,204,21,0.6)) drop-shadow(0 0 60px rgba(250,204,21,0.4))'
              }}
            >
              cashridez
            </span>
          </div>
          <p className="text-yellow-400/80 text-lg font-medium">Reset your password</p>
        </div>

        <Card className="p-8 backdrop-blur-xl bg-black/80 border-yellow-500/20">
          {!isValidLink ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <XCircle className="h-16 w-16 text-red-500" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">Invalid or Expired Link</h2>
              <p className="text-muted-foreground">
                This reset link is invalid or has expired. Please request a new password reset.
              </p>
              <Button 
                onClick={() => navigate("/auth")} 
                className="w-full mt-4"
              >
                Go to Sign In
              </Button>
            </div>
          ) : success ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle className="h-16 w-16 text-green-500" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">Password Updated!</h2>
              <p className="text-muted-foreground">
                Your password has been successfully updated. Redirecting to sign in...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Enter new password"
                  {...register("newPassword")}
                  className={errors.newPassword ? "border-red-500" : ""}
                />
                {errors.newPassword && (
                  <p className="text-sm text-red-500">{errors.newPassword.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm new password"
                  {...register("confirmPassword")}
                  className={errors.confirmPassword ? "border-red-500" : ""}
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating Password...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
