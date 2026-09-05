import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface SubscriptionStatus {
  subscribed: boolean;
  subscription_status?: string | null;
  subscription_end?: string;
  cancel_at_period_end: boolean;
  has_billing_account: boolean;
  completed_trips: number;
  connected_trips: number;
  trips_remaining: number | 'unlimited';
  loading: boolean;
  /** True when the status could not be confirmed (network/server problem). */
  unknown: boolean;
}

const FREE_CONNECTIONS = 3;

const EMPTY: SubscriptionStatus = {
  subscribed: false,
  subscription_status: null,
  subscription_end: undefined,
  cancel_at_period_end: false,
  has_billing_account: false,
  completed_trips: 0,
  connected_trips: 0,
  trips_remaining: FREE_CONNECTIONS,
  loading: false,
  unknown: false,
};

export const useSubscription = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus>({ ...EMPTY, loading: true });

  // Guards against applying a response that belongs to a previous account or
  // to a request that has been superseded by a newer one.
  const requestIdRef = useRef(0);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  const checkStatus = useCallback(async () => {
    const userId = user?.id ?? null;
    if (!userId) {
      setStatus({ ...EMPTY });
      return;
    }

    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current && userIdRef.current === userId;

    try {
      const { data, error } = await supabase.functions.invoke('check-subscription-status');

      if (!isCurrent()) return;

      if (error) {
        console.error('Error checking subscription:', error);

        // Fall back to the last known DB state. A FAILED fetch must never be
        // read as "zero connections used".
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('subscription_active, subscription_status, completed_trips_count, connected_trips_count, stripe_customer_id')
          .eq('id', userId)
          .maybeSingle();

        if (!isCurrent()) return;

        if (profileError || !profile) {
          console.error('Subscription fallback lookup failed:', profileError);
          setStatus((prev) => ({ ...prev, loading: false, unknown: true }));
          return;
        }

        const connectedTrips = profile.connected_trips_count || 0;
        const active = !!profile.subscription_active;
        setStatus({
          subscribed: active,
          subscription_status: profile.subscription_status ?? null,
          subscription_end: undefined,
          cancel_at_period_end: false,
          has_billing_account: !!profile.stripe_customer_id,
          completed_trips: profile.completed_trips_count || 0,
          connected_trips: connectedTrips,
          trips_remaining: active ? 'unlimited' : Math.max(0, FREE_CONNECTIONS - connectedTrips),
          loading: false,
          unknown: false,
        });
        return;
      }

      const connectedTrips = data?.connected_trips || 0;
      setStatus({
        subscribed: !!data?.subscribed,
        subscription_status: data?.subscription_status ?? null,
        subscription_end: data?.subscription_end ?? undefined,
        cancel_at_period_end: !!data?.cancel_at_period_end,
        has_billing_account: !!data?.has_billing_account,
        completed_trips: data?.completed_trips || 0,
        connected_trips: connectedTrips,
        trips_remaining: data?.trips_remaining ?? Math.max(0, FREE_CONNECTIONS - connectedTrips),
        loading: false,
        unknown: false,
      });
    } catch (error) {
      console.error('Error checking subscription:', error);
      if (!isCurrent()) return;
      setStatus((prev) => ({ ...prev, loading: false, unknown: true }));
    }
  }, [user?.id]);

  const startCheckout = async (returnUrl?: string) => {
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { cancel_url: returnUrl || window.location.href },
    });

    if (error) {
      console.error('Error creating checkout:', error);
      throw error;
    }

    if (data?.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data?.error || 'Checkout session could not be created');
    }
  };

  const manageSubscription = async () => {
    const { data, error } = await supabase.functions.invoke('create-customer-portal-session', {
      body: { return_url: window.location.href },
    });

    if (error) {
      console.error('Error opening portal:', error);
      throw error;
    }

    if (data?.url) {
      // Same-tab navigation: popup blockers reject window.open after an await.
      window.location.href = data.url;
    } else {
      throw new Error(data?.error || 'Billing portal could not be opened');
    }
  };

  useEffect(() => {
    // Reset immediately on account change so stale values are never shown.
    requestIdRef.current++;
    setStatus({ ...EMPTY, loading: !!user });

    if (!user) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) checkStatus();
    };

    const timeout = setTimeout(run, 100);
    const interval = setInterval(run, 60000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [user, checkStatus]);

  return {
    ...status,
    checkStatus,
    startCheckout,
    manageSubscription,
    // While loading or unknown, do not lock users out (fail open on gating),
    // but the limit is still enforced server-side on acceptance.
    canUseFeatures:
      status.subscribed || status.loading || status.unknown || status.connected_trips < FREE_CONNECTIONS,
    hasPremiumAccess: status.subscribed,
    isPremium: status.subscribed,
  };
};
