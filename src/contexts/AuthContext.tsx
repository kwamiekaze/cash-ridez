import React, { createContext, useContext, useEffect, useState, ReactNode, lazy, Suspense } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

const VerificationWelcomeDialog = lazy(() => 
  import("@/components/VerificationWelcomeDialog").then(module => ({
    default: module.VerificationWelcomeDialog
  }))
);

const PhoneNumberReminderDialog = lazy(() =>
  import("@/components/PhoneNumberReminderDialog").then(module => ({
    default: module.PhoneNumberReminderDialog
  }))
);

interface AuthContextType {
  user: User | null;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false);
  const [showPhoneReminderForTrip, setShowPhoneReminderForTrip] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Set up auth state listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      // Handle navigation after auth state changes
      if (event === 'SIGNED_IN' && session) {
        // Small delay to ensure profile is created
        setTimeout(async () => {
          // Process pending referral code if exists
          const pendingReferralCode = localStorage.getItem("pending_referral_code");
          if (pendingReferralCode) {
            try {
              await supabase.rpc("process_referral", {
                p_new_user_id: session.user.id,
                p_referral_code: pendingReferralCode
              });
              console.log("Referral processed successfully");
            } catch (refError) {
              console.error("Referral processing error:", refError);
            } finally {
              localStorage.removeItem("pending_referral_code");
            }
          }
          
          const { data: profile } = await supabase
            .from("profiles")
            .select("active_role, is_verified, verification_status, verification_submitted_at, id_image_url")
            .eq("id", session.user.id)
            .single();
          
          if (profile?.is_verified || profile?.verification_status === 'approved') {
            // Verified users go to their role-specific dashboard
            if (profile?.active_role === 'driver') {
              navigate('/driver');
            } else if (profile?.active_role === 'rider') {
              navigate('/rider');
            } else if (profile?.active_role === 'admin') {
              navigate('/admin');
            } else {
              navigate('/dashboard');
            }
          } else if (profile?.verification_status === 'pending' && (profile?.verification_submitted_at || profile?.id_image_url)) {
            // Only redirect to verification-pending if they actually submitted an ID
            navigate('/verification-pending');
          } else {
            // New users or users without ID submission go to onboarding
            navigate('/onboarding');
          }
        }, 100);
      }
    });

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // Don't navigate here - let the auth state change handle it
    return { error };
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const redirectUrl = `${window.location.origin}/onboarding`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          display_name: displayName,
        },
      },
    });

    if (!error) {
      navigate("/onboarding");
    }

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  // Subscribe to profile verification changes to show welcome dialog and trigger welcome email
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('profile-verification-dialog')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        async (payload) => {
          const oldStatus = payload.old.verification_status;
          const newStatus = payload.new.verification_status;
          const wasDismissed = payload.new.verification_welcome_dismissed;
          
          // Show welcome dialog when user becomes verified (and hasn't dismissed it)
          if (oldStatus !== 'approved' && newStatus === 'approved' && !wasDismissed) {
            setShowWelcomeDialog(true);
            
            // Trigger welcome email via edge function (backup to database trigger)
            try {
              const firstName = payload.new.full_name?.split(' ')[0] || payload.new.display_name || 'there';
              await supabase.functions.invoke('send-verification-welcome-email', {
                body: {
                  userId: user.id,
                  userEmail: payload.new.email,
                  firstName,
                  isDriver: payload.new.is_driver ?? false,
                  isRider: payload.new.is_rider ?? false
                }
              });
              console.log('Verification welcome email triggered');
            } catch (emailError) {
              console.error('Failed to trigger welcome email:', emailError);
              // Non-blocking - email will be sent via queue if this fails
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Subscribe to trip status changes to show phone reminder when trip gets connected
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('trip-connection-phone-reminder')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ride_requests',
        },
        async (payload) => {
          const oldStatus = payload.old.status;
          const newStatus = payload.new.status;
          const riderId = payload.new.rider_id;
          const driverId = payload.new.assigned_driver_id;
          
          // Only trigger when trip becomes assigned
          if (oldStatus !== 'assigned' && newStatus === 'assigned') {
            // Check if current user is part of this trip
            if (user.id === riderId || user.id === driverId) {
              // Check if user has phone number
              const { data: profile } = await supabase
                .from('profiles')
                .select('phone_number')
                .eq('id', user.id)
                .single();
              
              if (!profile?.phone_number) {
                setShowPhoneReminderForTrip(true);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, session, signIn, signUp, signOut, loading }}>
      {children}
      {user && (
        <Suspense fallback={null}>
          <VerificationWelcomeDialog 
            open={showWelcomeDialog} 
            onOpenChange={setShowWelcomeDialog}
            userId={user.id}
          />
          <PhoneNumberReminderDialog
            open={showPhoneReminderForTrip}
            onOpenChange={setShowPhoneReminderForTrip}
            showProfileButton={true}
          />
        </Suspense>
      )}
    </AuthContext.Provider>
  );
};
