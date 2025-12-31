// App-wide persistence provider - handles route persistence, scroll restore, and session rehydration
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRoutePersistence, useScrollPersistence, getLastRoute, clearLastRoute } from '@/hooks/useAppPersistence';
import { useSessionRehydration, useAuthReady } from '@/hooks/useSessionRehydration';

interface AppPersistenceProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that handles:
 * - Route persistence (saves last route on navigate)
 * - Scroll position persistence (per route)
 * - Session rehydration on resume
 * - Route restoration after app restart
 */
export function AppPersistenceProvider({ children }: AppPersistenceProviderProps): JSX.Element {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Initialize persistence hooks
  useRoutePersistence();
  useScrollPersistence();
  useSessionRehydration();
  
  const authReady = useAuthReady(loading, user);
  
  // Route restoration logic - only on initial load
  useEffect(() => {
    if (!authReady) return;
    
    // Only attempt route restoration if we're on root/home and user is logged in
    const isOnRoot = location.pathname === '/' || location.pathname === '';
    
    if (user && isOnRoot) {
      const lastRoute = getLastRoute();
      
      if (lastRoute) {
        // Only restore routes that are less than 2 hours old
        const TWO_HOURS = 2 * 60 * 60 * 1000;
        if (lastRoute.age < TWO_HOURS) {
          // Don't restore to the same route or auth routes
          const skipRestore = ['/', '/auth', '/blocked', '/reset-password'];
          if (!skipRestore.includes(lastRoute.route) && lastRoute.route !== location.pathname) {
            navigate(lastRoute.route, { replace: true });
          }
        }
        clearLastRoute();
      }
    }
  }, [authReady, user, location.pathname, navigate]);
  
  return <>{children}</>;
}
