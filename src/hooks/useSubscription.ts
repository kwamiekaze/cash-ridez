import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface SubscriptionStatus {
  subscribed: boolean;
  subscription_end?: string;
  completed_trips: number;
  trips_remaining: number | 'unlimited';
  loading: boolean;
}

export const useSubscription = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus>({
    subscribed: false,
    completed_trips: 0,
    trips_remaining: 3,
    loading: true,
  });

  const checkStatus = async () => {
    if (!user) {
      setStatus({
        subscribed: false,
        completed_trips: 0,
        trips_remaining: 3,
        loading: false,
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('check-subscription-status', {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (error) {
        console.error('Error checking subscription:', error);
        // Fallback to local data
        const { data: profile } = await supabase
          .from('profiles')
          .select('subscription_active, completed_trips_count')
          .eq('id', user.id)
          .single();

        setStatus({
          subscribed: profile?.subscription_active || false,
          completed_trips: profile?.completed_trips_count || 0,
          trips_remaining: profile?.subscription_active 
            ? 'unlimited' 
            : Math.max(0, 3 - (profile?.completed_trips_count || 0)),
          loading: false,
        });
      } else {
        setStatus({
          ...data,
          loading: false,
        });
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
      setStatus(prev => ({ ...prev, loading: false }));
    }
  };

  const startCheckout = async (returnUrl?: string) => {
    try {
      const currentUrl = returnUrl || window.location.href;
      
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { return_url: currentUrl },
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (error) throw error;
      
      if (data?.url) {
        // Navigate to checkout in same window
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
      throw error;
    }
  };

  const manageSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('create-customer-portal-session', {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (error) throw error;
      
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Error opening portal:', error);
      throw error;
    }
  };

  useEffect(() => {
    // Defer initial check to requestIdleCallback for non-blocking after paint
    if ('requestIdleCallback' in window) {
      const idleId = requestIdleCallback(() => {
        checkStatus();
      }, { timeout: 2000 });
      
      // Auto-refresh every minute
      const interval = setInterval(checkStatus, 60000);
      
      return () => {
        cancelIdleCallback(idleId);
        clearInterval(interval);
      };
    } else {
      // Fallback for browsers without requestIdleCallback
      const timeout = setTimeout(checkStatus, 100);
      const interval = setInterval(checkStatus, 60000);
      
      return () => {
        clearTimeout(timeout);
        clearInterval(interval);
      };
    }
  }, [user]);

  return {
    ...status,
    checkStatus,
    startCheckout,
    manageSubscription,
    canUseFeatures: status.subscribed || status.completed_trips < 3,
  };
};
