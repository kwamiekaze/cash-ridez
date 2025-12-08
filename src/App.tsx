import { lazy, Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { NotificationPermissionDialog } from "@/components/NotificationPermissionDialog";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import { Loader2 } from "lucide-react";
import { PageViewTracker } from "./components/PageViewTracker";
import { FloatingUpdatePin } from "./components/FloatingUpdatePin";

// Lazy load pages for better performance
const Index = lazy(() => import("./pages/Index"));
const LandingNew = lazy(() => import("./pages/LandingNew"));
const Auth = lazy(() => import("./pages/Auth"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const VerificationPending = lazy(() => import("./pages/VerificationPending"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
// Import RiderDashboard directly to avoid context issues
import RiderDashboard from "./pages/RiderDashboard";
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
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const InstallApp = lazy(() => import("./pages/InstallApp"));
const Referrals = lazy(() => import("./pages/Referrals"));
const Refer = lazy(() => import("./pages/Refer"));
const LiveMap = lazy(() => import("./pages/LiveMap"));
import { Navigate } from "react-router-dom";

// Loading fallback component
const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

// Global floating update pin wrapper - only shows on non-map pages for signed-in users
const GlobalFloatingUpdatePin = () => {
  const { user } = useAuth();
  const location = useLocation();
  
  // Don't show on map page (has its own update button) or public pages
  const isMapPage = location.pathname === '/map' || location.pathname === '/live-map';
  const isPublicPage = ['/', '/auth', '/refer', '/terms', '/privacy', '/install-app', '/reset-password'].includes(location.pathname);
  
  if (!user || isMapPage || isPublicPage) return null;
  
  return <FloatingUpdatePin />;
};

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes cache
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" forcedTheme="dark">
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthProvider>
          <Toaster />
          <Sonner />
          <PageViewTracker />
          <GlobalFloatingUpdatePin />
          <DeferMount>
            <NotificationPermissionDialog />
          </DeferMount>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<LandingNew />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
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

export default App;
