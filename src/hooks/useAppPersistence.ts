// App-wide persistence utilities for session rehydration, route persistence, and draft management
import { useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// ============ Storage Keys ============
const STORAGE_KEYS = {
  LAST_ROUTE: 'app:lastRoute',
  LAST_ROUTE_AT: 'app:lastRouteAt',
  SCROLL_PREFIX: 'app:scroll:',
  DRAFT_PREFIX: 'draft:',
  UI_STATE_PREFIX: 'ui:',
  AUTH_READY: 'app:authReady',
} as const;

// ============ Draft System ============
interface DraftData<T> {
  updatedAt: number;
  version: number;
  data: T;
}

const DRAFT_VERSION = 1;
const DRAFT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export function saveDraft<T>(key: string, data: T): void {
  try {
    const draft: DraftData<T> = {
      updatedAt: Date.now(),
      version: DRAFT_VERSION,
      data,
    };
    localStorage.setItem(`${STORAGE_KEYS.DRAFT_PREFIX}${key}`, JSON.stringify(draft));
  } catch (e) {
    console.warn('Failed to save draft:', e);
  }
}

export function loadDraft<T>(key: string): T | null {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEYS.DRAFT_PREFIX}${key}`);
    if (!stored) return null;
    
    const draft: DraftData<T> = JSON.parse(stored);
    
    // Check version and expiry
    if (draft.version !== DRAFT_VERSION) return null;
    if (Date.now() - draft.updatedAt > DRAFT_EXPIRY_MS) {
      clearDraft(key);
      return null;
    }
    
    return draft.data;
  } catch (e) {
    console.warn('Failed to load draft:', e);
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(`${STORAGE_KEYS.DRAFT_PREFIX}${key}`);
  } catch (e) {
    console.warn('Failed to clear draft:', e);
  }
}

export function getDraftAge(key: string): number | null {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEYS.DRAFT_PREFIX}${key}`);
    if (!stored) return null;
    const draft: DraftData<unknown> = JSON.parse(stored);
    return Date.now() - draft.updatedAt;
  } catch {
    return null;
  }
}

// ============ Route Persistence ============
export function saveLastRoute(pathname: string, search: string = ''): void {
  try {
    // Don't save auth/login routes or error pages
    const skipRoutes = ['/auth', '/blocked', '/reset-password'];
    if (skipRoutes.some(r => pathname.startsWith(r))) return;
    
    localStorage.setItem(STORAGE_KEYS.LAST_ROUTE, pathname + search);
    localStorage.setItem(STORAGE_KEYS.LAST_ROUTE_AT, Date.now().toString());
  } catch (e) {
    console.warn('Failed to save last route:', e);
  }
}

export function getLastRoute(): { route: string; age: number } | null {
  try {
    const route = localStorage.getItem(STORAGE_KEYS.LAST_ROUTE);
    const savedAt = localStorage.getItem(STORAGE_KEYS.LAST_ROUTE_AT);
    if (!route || !savedAt) return null;
    
    const age = Date.now() - parseInt(savedAt, 10);
    return { route, age };
  } catch {
    return null;
  }
}

export function clearLastRoute(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.LAST_ROUTE);
    localStorage.removeItem(STORAGE_KEYS.LAST_ROUTE_AT);
  } catch (e) {
    console.warn('Failed to clear last route:', e);
  }
}

// ============ Scroll Position ============
export function saveScrollPosition(routeKey: string, scrollY: number): void {
  try {
    sessionStorage.setItem(`${STORAGE_KEYS.SCROLL_PREFIX}${routeKey}`, scrollY.toString());
  } catch (e) {
    console.warn('Failed to save scroll position:', e);
  }
}

export function getScrollPosition(routeKey: string): number {
  try {
    const saved = sessionStorage.getItem(`${STORAGE_KEYS.SCROLL_PREFIX}${routeKey}`);
    return saved ? parseInt(saved, 10) : 0;
  } catch {
    return 0;
  }
}

// ============ UI State Persistence ============
export function saveUIState<T>(key: string, data: T): void {
  try {
    sessionStorage.setItem(`${STORAGE_KEYS.UI_STATE_PREFIX}${key}`, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save UI state:', e);
  }
}

export function loadUIState<T>(key: string): T | null {
  try {
    const stored = sessionStorage.getItem(`${STORAGE_KEYS.UI_STATE_PREFIX}${key}`);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function clearUIState(key: string): void {
  try {
    sessionStorage.removeItem(`${STORAGE_KEYS.UI_STATE_PREFIX}${key}`);
  } catch (e) {
    console.warn('Failed to clear UI state:', e);
  }
}

// ============ Hooks ============

/**
 * Hook to persist current route on every navigation
 */
export function useRoutePersistence(): void {
  const location = useLocation();
  
  useEffect(() => {
    saveLastRoute(location.pathname, location.search);
  }, [location.pathname, location.search]);
}

/**
 * Hook to save and restore scroll position per route
 */
export function useScrollPersistence(): void {
  const location = useLocation();
  const routeKey = location.pathname;
  const isRestoring = useRef(false);
  
  // Save scroll on scroll (throttled)
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const handleScroll = () => {
      if (isRestoring.current) return;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        saveScrollPosition(routeKey, window.scrollY);
      }, 150);
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(timeoutId);
    };
  }, [routeKey]);
  
  // Restore scroll on route change / page show
  useEffect(() => {
    const restoreScroll = () => {
      const savedY = getScrollPosition(routeKey);
      if (savedY > 0) {
        isRestoring.current = true;
        requestAnimationFrame(() => {
          window.scrollTo(0, savedY);
          setTimeout(() => {
            isRestoring.current = false;
          }, 100);
        });
      }
    };
    
    // Slight delay to allow content to render
    const timeoutId = setTimeout(restoreScroll, 50);
    
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        restoreScroll();
      }
    };
    
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      clearTimeout(timeoutId);
    };
  }, [routeKey]);
}

/**
 * Hook for form draft auto-save and restore
 */
export function useDraftPersistence<T>(
  draftKey: string,
  formData: T,
  setFormData: (data: T) => void,
  options: {
    debounceMs?: number;
    onRestore?: () => void;
    enabled?: boolean;
  } = {}
): {
  hasDraft: boolean;
  draftAge: number | null;
  discardDraft: () => void;
} {
  const { debounceMs = 500, onRestore, enabled = true } = options;
  const initializedRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  
  // Restore draft on mount
  useEffect(() => {
    if (!enabled || initializedRef.current) return;
    initializedRef.current = true;
    
    const draft = loadDraft<T>(draftKey);
    if (draft) {
      setFormData(draft);
      onRestore?.();
    }
  }, [draftKey, setFormData, onRestore, enabled]);
  
  // Auto-save on form change (debounced)
  useEffect(() => {
    if (!enabled || !initializedRef.current) return;
    
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveDraft(draftKey, formData);
    }, debounceMs);
    
    return () => clearTimeout(saveTimeoutRef.current);
  }, [draftKey, formData, debounceMs, enabled]);
  
  // Save on visibility change / page hide
  useEffect(() => {
    if (!enabled) return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveDraft(draftKey, formData);
      }
    };
    
    const handlePageHide = () => {
      saveDraft(draftKey, formData);
    };
    
    const handleBeforeUnload = () => {
      saveDraft(draftKey, formData);
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [draftKey, formData, enabled]);
  
  const draftAge = getDraftAge(draftKey);
  
  const discardDraft = useCallback(() => {
    clearDraft(draftKey);
  }, [draftKey]);
  
  return {
    hasDraft: draftAge !== null,
    draftAge,
    discardDraft,
  };
}
