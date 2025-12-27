import React, { lazy, Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "./contexts/AuthContext";
import { NotificationPermissionDialog } from "@/components/NotificationPermissionDialog";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import { Loader2 } from "lucide-react";
import { PageViewTracker } from "./components/PageViewTracker";
import { useNotificationSound } from "./hooks/useNotificationSound";
import { useVoicemailAudioSeed } from "@/hooks/useVoicemailAudioSeed";
import { AppUpdateBanner } from "./components/AppUpdateBanner";

// Lazy load pages for better performance
const Index = lazy(() => import("./pages/Index"));
const LandingNew = lazy(() => import("./pages/LandingNew"));
const Auth = lazy(() => import("./pages/Auth"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const VerificationPending = lazy(() => import("./pages/VerificationPending"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const RiderDashboard = lazy(() => import("./pages/RiderDashboard"));
const DriverDashboard = lazy(() => import("./pages/DriverDashboard"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const CreateRideRequest = lazy(() => import("./pages/CreateRideRequest"));
const Profile = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));
const TripDetails = lazy(() => import("./pages/TripDetails"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const TripHistory = lazy(() => import("./pages/TripHistory"));
const BillingSuccess = lazy(() => import("./pages/BillingSuccess"));
const BillingCancelled = lazy(() => import("./pages/BillingCancelled"));
const Subscription = lazy(() => import("./pages/Subscription"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Community = lazy(() => import("./pages/Community"));
const RoleRedirect = lazy(() => import("./components/RoleRedirect"));
const Updates = lazy(() => import("./pages/Updates"));
const AdminSystemMessages = lazy(() => import("./pages/AdminSystemMessages"));
const AdminSmsCenter = lazy(() => import("./pages/AdminSmsCenter"));
const AdminCallCenter = lazy(() => import("./pages/AdminCallCenter"));
const AdminDownloads = lazy(() => import("./pages/AdminDownloads"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const InstallApp = lazy(() => import("./pages/InstallApp"));
const Referrals = lazy(() => import("./pages/Referrals"));
const Refer = lazy(() => import("./pages/Refer"));
const LiveMap = lazy(() => import("./pages/LiveMap"));
const RiderTips = lazy(() => import("./pages/RiderTips"));
const DriverTips = lazy(() => import("./pages/DriverTips"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const BlockedPage = lazy(() => import("./pages/BlockedPage"));

// Loading fallback component
const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

// Floating update pin removed - now in AppHeader for better UX

// Initialize notification sound system globally
const NotificationSoundInitializer = React.memo(() => {
  useNotificationSound();
  return <React.Fragment />;
});

// Ensure voicemail audio is present in backend storage
const VoicemailAudioSeeder = React.memo(() => {
  useVoicemailAudioSeed();
  return <React.Fragment />;
});

// Defer non-critical UI until idle
const DeferMount = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const onIdle = (cb: () => void) => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(cb);
      } else {
        setTimeout(cb, 250);
      }
    };
    onIdle(() => setMounted(true));
  }, []);
  return mounted ? <>{children}</> : null;
};

// Redirect cashridez.map domain to cashridez.com/map
const DomainRedirect = () => {
  useEffect(() => {
    const hostname = window.location.hostname;
    if (hostname === 'cashridez.map' || hostname === 'www.cashridez.map') {
      const params = window.location.search;
      window.location.replace(`https://cashridez.com/map${params}`);
    }
  }, []);
  return null;
};

const App = () => {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 30, // 30 minutes cache
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }));

  return (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" forcedTheme="dark">
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthProvider>
          <DomainRedirect />
          <NotificationSoundInitializer />
          <VoicemailAudioSeeder />
          <AppUpdateBanner />
          <Toaster />
          <Sonner />
          <PageViewTracker />
          
          <DeferMount>
            <NotificationPermissionDialog />
          </DeferMount>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<LandingNew />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/blocked" element={<BlockedPage />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/community" element={<Community />} />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <Onboarding />
                </ProtectedRoute>
              }
            />
            <Route
              path="/verification-pending"
              element={
                <ProtectedRoute>
                  <VerificationPending />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <RoleRedirect />
                </ProtectedRoute>
              }
            />
            <Route
              path="/rider"
              element={
                <ProtectedRoute>
                  <RiderDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/driver"
              element={
                <ProtectedRoute>
                  <DriverDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/rider/create-request"
              element={
                <ProtectedRoute>
                  <CreateRideRequest />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/trips"
              element={
                <ProtectedRoute>
                  <DriverDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/trip/:id"
              element={
                <ProtectedRoute>
                  <TripDetails />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat/:id"
              element={
                <ProtectedRoute>
                  <ChatPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/history"
              element={
                <ProtectedRoute>
                  <TripHistory />
                </ProtectedRoute>
              }
            />
            <Route
              path="/billing/success"
              element={
                <ProtectedRoute>
                  <BillingSuccess />
                </ProtectedRoute>
              }
            />
            <Route
              path="/billing/cancelled"
              element={
                <ProtectedRoute>
                  <BillingCancelled />
                </ProtectedRoute>
              }
            />
            <Route
              path="/subscription"
              element={
                <ProtectedRoute>
                  <Subscription />
                </ProtectedRoute>
              }
            />
            <Route
              path="/updates"
              element={
                <ProtectedRoute>
                  <Updates />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/system-messages"
              element={
                <AdminRoute>
                  <AdminSystemMessages />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/sms"
              element={
                <AdminRoute>
                  <AdminSmsCenter />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/calls"
              element={
                <AdminRoute>
                  <AdminCallCenter />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/downloads"
              element={
                <AdminRoute>
                  <AdminDownloads />
                </AdminRoute>
              }
            />
            <Route
              path="/install-app"
              element={<InstallApp />}
            />
            <Route
              path="/refer"
              element={<Refer />}
            />
            <Route
              path="/referrals"
              element={
                <ProtectedRoute>
                  <Referrals />
                </ProtectedRoute>
              }
            />
            {/* Rider Tips - role protected */}
            <Route
              path="/rider/tips"
              element={
                <ProtectedRoute>
                  <RiderTips />
                </ProtectedRoute>
              }
            />
            {/* Driver Tips - role protected */}
            <Route
              path="/driver/tips"
              element={
                <ProtectedRoute>
                  <DriverTips />
                </ProtectedRoute>
              }
            />
            {/* Public map route - accessible without login */}
            <Route
              path="/map"
              element={<LiveMap />}
            />
            {/* Redirect old /live-map route to /map */}
            <Route
              path="/live-map"
              element={<Navigate to="/map" replace />}
            />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          </AuthProvider>
        </BrowserRouter>
    </ThemeProvider>
  </QueryClientProvider>
  );
};

export default App;
