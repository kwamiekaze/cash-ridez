// Session rehydration hook - handles resume events and session recovery
import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RehydrationState {
  isRehydrating: boolean;
  lastRehydratedAt: number | null;
}

/**
 * Hook to handle session rehydration on app resume events
 * Listens to: visibilitychange, pageshow, focus
 * Silently rehydrates session without disrupting user flow
 */
export function useSessionRehydration(): RehydrationState {
  const [state, setState] = useState<RehydrationState>({
    isRehydrating: false,
    lastRehydratedAt: null,
  });
  
  const isRehydratingRef = useRef(false);
  const lastRehydrateAttemptRef = useRef<number>(0);
  const REHYDRATE_DEBOUNCE_MS = 3000; // Don't rehydrate more than once every 3 seconds
  
  const rehydrateSession = useCallback(async (showToast = false) => {
    // Debounce rapid rehydration attempts
    const now = Date.now();
    if (now - lastRehydrateAttemptRef.current < REHYDRATE_DEBOUNCE_MS) {
      return;
    }
    
    if (isRehydratingRef.current) return;
    isRehydratingRef.current = true;
    lastRehydrateAttemptRef.current = now;
    
    setState(prev => ({ ...prev, isRehydrating: true }));
    
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.warn('Session rehydration error:', error);
        return;
      }
      
      if (session) {
        // Session is valid - optionally refresh token if close to expiry
        const expiresAt = session.expires_at;
        if (expiresAt) {
          const expiresIn = expiresAt * 1000 - Date.now();
          // If token expires in less than 5 minutes, refresh it
          if (expiresIn < 5 * 60 * 1000) {
            await supabase.auth.refreshSession();
          }
        }
        
        if (showToast) {
          toast.success('Reconnected', { duration: 2000 });
        }
      }
      
      setState({
        isRehydrating: false,
        lastRehydratedAt: Date.now(),
      });
    } catch (e) {
      console.warn('Failed to rehydrate session:', e);
      setState(prev => ({ ...prev, isRehydrating: false }));
    } finally {
      isRehydratingRef.current = false;
    }
  }, []);
  
  useEffect(() => {
    let wasHidden = false;
    let hiddenAt = 0;
    const LONG_BACKGROUND_MS = 30000; // Show toast if backgrounded > 30s
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        wasHidden = true;
        hiddenAt = Date.now();
      } else if (document.visibilityState === 'visible' && wasHidden) {
        const backgroundDuration = Date.now() - hiddenAt;
        const showToast = backgroundDuration > LONG_BACKGROUND_MS;
        rehydrateSession(showToast);
        wasHidden = false;
      }
    };
    
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        // Page was restored from bfcache
        rehydrateSession(true);
      }
    };
    
    const handleFocus = () => {
      // Also rehydrate on focus (covers some edge cases)
      rehydrateSession(false);
    };
    
    // Initial rehydration on mount
    rehydrateSession(false);
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleFocus);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleFocus);
    };
  }, [rehydrateSession]);
  
  return state;
}

/**
 * Hook to detect if auth is ready (prevents premature redirects)
 */
export function useAuthReady(loading: boolean, user: unknown): boolean {
  const [isReady, setIsReady] = useState(false);
  const readyTimeoutRef = useRef<NodeJS.Timeout>();
  
  useEffect(() => {
    if (!loading) {
      // Small delay to ensure auth state is settled
      readyTimeoutRef.current = setTimeout(() => {
        setIsReady(true);
      }, 50);
    }
    
    return () => {
      clearTimeout(readyTimeoutRef.current);
    };
  }, [loading]);
  
  return isReady;
}
