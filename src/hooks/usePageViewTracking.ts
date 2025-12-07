import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// Map paths to human-readable labels
const PAGE_LABELS: Record<string, string> = {
  "/": "Home",
  "/auth": "Login / Sign Up",
  "/onboarding": "Onboarding",
  "/dashboard": "Dashboard",
  "/rider": "Rider Dashboard",
  "/driver": "Driver Dashboard",
  "/create-trip": "Create Trip",
  "/trip-requests": "Trip Requests",
  "/trip-history": "Trip History",
  "/community": "Community",
  "/profile": "Profile",
  "/subscription": "Subscription",
  "/refer": "Referral Landing",
  "/referrals": "My Referrals",
  "/install-app": "Install App",
  "/admin": "Admin Dashboard",
  "/admin/system-messages": "Admin System Messages",
  "/updates": "Updates",
  "/terms": "Terms of Service",
  "/privacy": "Privacy Policy",
  "/billing-success": "Billing Success",
  "/billing-cancelled": "Billing Cancelled",
  "/verification-pending": "Verification Pending",
  "/reset-password": "Reset Password",
};

function getPageLabel(path: string): string {
  // Check for exact match first
  if (PAGE_LABELS[path]) return PAGE_LABELS[path];
  
  // Check for trip details pattern
  if (path.startsWith("/trip/")) return "Trip Details";
  
  // Check for chat pattern
  if (path.startsWith("/chat/")) return "Trip Chat";
  
  // Default to formatted path
  const cleanPath = path.replace(/^\//, "").replace(/-/g, " ");
  return cleanPath.charAt(0).toUpperCase() + cleanPath.slice(1) || "Home";
}

function getDeviceType(): string {
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function usePageViewTracking() {
  const location = useLocation();
  const lastTrackedPath = useRef<string | null>(null);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const trackPageView = async () => {
      const currentPath = location.pathname;
      
      // Avoid duplicate tracking for same path
      if (lastTrackedPath.current === currentPath) return;
      lastTrackedPath.current = currentPath;

      try {
        // Get current session
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id || null;

        let profileData: {
          full_name: string | null;
          display_name: string | null;
          email: string | null;
          verification_status: string | null;
          is_verified: boolean | null;
          subscription_active: boolean | null;
          subscription_status: string | null;
          active_role: string | null;
          is_driver: boolean | null;
          is_rider: boolean | null;
        } | null = null;

        // Fetch profile data if user is logged in
        if (userId) {
          const { data } = await supabase
            .from("profiles")
            .select("full_name, display_name, email, verification_status, is_verified, subscription_active, subscription_status, active_role, is_driver, is_rider")
            .eq("id", userId)
            .single();
          profileData = data;
        }

        // Determine role
        let role = profileData?.active_role || null;
        if (!role && profileData) {
          if (profileData.is_driver) role = "driver";
          else if (profileData.is_rider) role = "rider";
        }

        // Build verification status
        let verificationStatus = "unverified";
        if (profileData?.is_verified) {
          verificationStatus = "verified";
        } else if (profileData?.verification_status === "pending") {
          verificationStatus = "pending";
        }

        // Insert page view
        const { error } = await supabase.from("page_views").insert({
          user_id: userId,
          full_name_snapshot: profileData?.full_name || profileData?.display_name || null,
          user_identifier_snapshot: userId || null,
          email_snapshot: profileData?.email || null,
          verification_status_snapshot: verificationStatus,
          is_subscribed: profileData?.subscription_active || false,
          subscription_status_snapshot: profileData?.subscription_status || "free",
          role_snapshot: role,
          path: currentPath,
          page_label: getPageLabel(currentPath),
          device_type: getDeviceType(),
          referrer: document.referrer || null,
        });

        if (error) {
          console.error("Error tracking page view:", error);
        }
      } catch (error) {
        console.error("Error tracking page view:", error);
      }
    };

    // Debounce to prevent rapid-fire tracking
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    
    debounceTimeout.current = setTimeout(() => {
      trackPageView();
    }, 300);

    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [location.pathname]);
}
