import { usePageViewTracking } from "@/hooks/usePageViewTracking";

// This component wraps the page view tracking hook
// It renders nothing but tracks page views on route changes
export function PageViewTracker() {
  usePageViewTracking();
  return null;
}
