import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook to sync driver availability notifications with the Available Drivers list
 * Ensures that when a driver becomes available and a notification is sent,
 * they also appear in the rider's Available Drivers section
 */
export const useDriverAvailabilitySync = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Subscribe to driver_status changes in realtime
    const channel = supabase
      .channel(`driver-availability-sync-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'driver_status',
          filter: `state=eq.available`,
        },
        async (payload) => {
          console.log('🚗 Driver became available:', payload);
          
          // The driver will automatically appear in the Available Drivers list
          // because the AvailableDriversList component subscribes to driver_status changes
          // This hook is just for logging and potential future enhancements
        }
      )
      .subscribe((status, err) => {
        if (err) console.warn('[realtime] subscription error:', err);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);
};
