import { useState, useEffect, useCallback, useRef } from 'react';

interface VersionInfo {
  version: string;
  buildTime: string;
}

interface UseAppUpdateResult {
  updateAvailable: boolean;
  currentVersion: string | null;
  newVersion: string | null;
  isChecking: boolean;
  triggerUpdate: () => void;
  dismissUpdate: () => void;
  isDismissed: boolean;
}

const VERSION_STORAGE_KEY = 'cashridez_app_version';
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export function useAppUpdate(): UseAppUpdateResult {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const checkForUpdate = useCallback(async () => {
    if (isChecking) return;
    
    setIsChecking(true);
    try {
      const response = await fetch('/version.json', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.ok) {
        console.debug('Version check failed:', response.status);
        return;
      }

      const versionInfo: VersionInfo = await response.json();
      const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY);

      if (!storedVersion) {
        // First time - store current version
        localStorage.setItem(VERSION_STORAGE_KEY, versionInfo.version);
        setCurrentVersion(versionInfo.version);
      } else if (storedVersion !== versionInfo.version) {
        // Update available
        setCurrentVersion(storedVersion);
        setNewVersion(versionInfo.version);
        setUpdateAvailable(true);
        setIsDismissed(false);
      } else {
        setCurrentVersion(storedVersion);
      }
    } catch (error) {
      console.debug('Error checking for update:', error);
    } finally {
      setIsChecking(false);
    }
  }, [isChecking]);

  const triggerUpdate = useCallback(async () => {
    try {
      // Store new version before reload
      if (newVersion) {
        localStorage.setItem(VERSION_STORAGE_KEY, newVersion);
      }

      // Get service worker registration
      const registration = swRegistrationRef.current || await navigator.serviceWorker?.getRegistration();
      
      if (registration) {
        // Check for SW updates
        await registration.update();
        
        // If there's a waiting SW, activate it
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }

      // Listen for controller change and reload
      if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        }, { once: true });
      }

      // If no SW change happens within 1 second, just reload
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Error triggering update:', error);
      // Fallback: just reload
      window.location.reload();
    }
  }, [newVersion]);

  const dismissUpdate = useCallback(() => {
    setIsDismissed(true);
  }, []);

  // Initial check on mount
  useEffect(() => {
    checkForUpdate();
  }, []);

  // Periodic check every 10 minutes
  useEffect(() => {
    const intervalId = setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [checkForUpdate]);

  // Store SW registration
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        swRegistrationRef.current = registration || null;
      });
    }
  }, []);

  // Listen for new SW installations
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleStateChange = () => {
      if (swRegistrationRef.current?.waiting) {
        // New SW is waiting - trigger update check
        checkForUpdate();
      }
    };

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration) {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', handleStateChange);
          }
        });
      }
    });
  }, [checkForUpdate]);

  return {
    updateAvailable,
    currentVersion,
    newVersion,
    isChecking,
    triggerUpdate,
    dismissUpdate,
    isDismissed
  };
}
