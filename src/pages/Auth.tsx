import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Lock, Gift } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MapBackground } from "@/components/MapBackground";
import { ForgotPasswordDialog } from "@/components/ForgotPasswordDialog";
import { SplashScreen } from "@/components/SplashScreen";
import { PASSWORD_POLICY, getPasswordRequirementsText, validatePassword } from "@/lib/passwordValidation";

const Auth = () => {
  const [showSplash, setShowSplash] = useState(true);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    signIn,
    signUp
  } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [referralCode, setReferralCode] = useState("");

  // Signup password validation (shared policy)
  const [signupPassword, setSignupPassword] = useState("");
  const signupPasswordValidation = useMemo(() => validatePassword(signupPassword), [signupPassword]);
  const showSignupPasswordError = signupPassword.length > 0 && !signupPasswordValidation.isValid;

  // Pre-fill referral code from URL parameter
  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) {
      setReferralCode(refCode.toUpperCase());
    }
  }, [searchParams]);
  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const {
      error
    } = await signIn(email, password);
    if (error) {
      toast.error(error.message || "Failed to sign in");
    } else {
      toast.success("Signed in successfully!");
    }
    setIsLoading(false);
  };
  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const displayName = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const enteredReferralCode = formData.get("referral_code") as string;

    // Validate password using the same shared policy as admin temp password
    const validation = validatePassword(password);
    if (!validation.isValid) {
      toast.error(validation.errors[0]);
      setIsLoading(false);
      return;
    }
    
    // Store referral code in localStorage to process after signup
    if (enteredReferralCode?.trim()) {
      localStorage.setItem("pending_referral_code", enteredReferralCode.trim().toUpperCase());
    }
    
    const { error } = await signUp(email, password, displayName);
    
    if (error) {
      toast.error(error.message || "Failed to create account");
      localStorage.removeItem("pending_referral_code");
    } else {
      toast.success("Account created!");
      // Referral will be processed via auth state change listener
    }
    setIsLoading(false);
  };
  // Google sign-in temporarily disabled
  // const handleGoogleSignIn = async () => {
  //   setIsLoading(true);
  //   const {
  //     error
  //   } = await supabase.auth.signInWithOAuth({
  //     provider: "google",
  //     options: {
  //       redirectTo: `${window.location.origin}/dashboard`
  //     }
  //   });
  //   if (error) {
  //     toast.error(error.message || "Failed to sign in with Google");
  //     setIsLoading(false);
  //   }
  // };
  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} duration={2500} />;
  }

  return <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-background via-background to-accent/5">
      <MapBackground showAnimatedCar showRiders intensity="prominent" className="absolute inset-0 z-0 pointer-events-none" />
      
      {/* Background Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-emerald-950/40 to-black/80 z-0" />
      
      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8 mt-8">
          <div className="inline-flex flex-col items-center gap-3 mb-4">
            <span className="font-bold bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-400 bg-clip-text text-transparent text-5xl animate-shimmer bg-[length:200%_auto]" style={{
            fontFamily: "'Playfair Display', serif",
            filter: 'drop-shadow(0 0 20px rgba(250,204,21,0.9)) drop-shadow(0 0 40px rgba(250,204,21,0.6)) drop-shadow(0 0 60px rgba(250,204,21,0.4))'
          }}>
              cashridez
            </span>
          </div>
          <p className="text-yellow-400/80 text-lg font-medium">Welcome back to the community</p>
        </div>

        <Card className="p-8 backdrop-blur-xl bg-black/80 border-yellow-500/20">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="signin-email" name="email" type="email" placeholder="you@example.com" className="pl-10" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="signin-password" name="password" type="password" placeholder="••••••••" className="pl-10" required />
                  </div>
                </div>
                
                <Button 
                  type="button" 
                  variant="link" 
                  className="text-sm text-yellow-400/80 hover:text-yellow-400 p-0 h-auto"
                  onClick={() => setForgotPasswordOpen(true)}
                >
                  Forgot password?
                </Button>

                <Button type="submit" className="w-full bg-gradient-to-r from-yellow-500 to-emerald-500 hover:from-yellow-600 hover:to-emerald-600 text-black font-semibold" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full Name</Label>
                  <Input id="signup-name" name="name" type="text" placeholder="John Doe" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="signup-email" name="email" type="email" placeholder="you@example.com" className="pl-10" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-password"
                      name="password"
                      type="password"
                      placeholder="••••••••"
                      className={`pl-10 ${showSignupPasswordError ? "border-destructive" : ""}`}
                      required
                      minLength={PASSWORD_POLICY.minLength}
                      maxLength={PASSWORD_POLICY.maxLength}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{getPasswordRequirementsText()}</p>
                  {showSignupPasswordError && (
                    <p className="text-xs text-destructive">{signupPasswordValidation.errors[0]}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-referral">Referral Code (optional)</Label>
                  <div className="relative">
                    <Gift className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="signup-referral" 
                      name="referral_code" 
                      type="text" 
                      placeholder="Enter referral code" 
                      className="pl-10 uppercase"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-yellow-500 to-emerald-500 hover:from-yellow-600 hover:to-emerald-600 text-black font-semibold"
                  disabled={isLoading || !signupPasswordValidation.isValid}
                >
                  {isLoading ? "Creating account..." : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <ForgotPasswordDialog 
            open={forgotPasswordOpen} 
            onOpenChange={setForgotPasswordOpen} 
          />

          {/* Google sign-in temporarily disabled */}
          {/* <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-card px-4 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <Button variant="outline" onClick={handleGoogleSignIn} disabled={isLoading} className="w-full bg-stone-600 hover:bg-stone-500">
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </Button> */}

          <p className="text-center text-sm text-muted-foreground mt-6">
            By continuing, you agree to our{" "}
            <a href="#" className="text-primary hover:underline">Terms</a>
            {" and "}
            <a href="#" className="text-primary hover:underline">Privacy Policy</a>
          </p>
        </Card>

        <div className="text-center mt-6">
          <Button variant="link" className="text-white/80 hover:text-white" onClick={() => navigate("/")}>
            ← Back to Home
          </Button>
        </div>
      </div>
    </div>;
};
export default Auth;