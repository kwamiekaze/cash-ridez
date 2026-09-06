import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  applyFailure,
  applySuccess,
  canUseFeatures as canUseFeaturesFor,
  connectedTrips as connectedTripsOf,
  FREE_CONNECTIONS,
  isConfirmed,
  isEntitled,
  loadingStateFor,
  signedOutState,
  stateForOwner,
  tripsRemaining as tripsRemainingOf,
  type SubscriptionState,
} from '@/lib/subscriptionState';

export { FREE_CONNECTIONS };

/** Extract a usable redirect URL from an edge-function response, or throw. */
const requireRedirectUrl = (data: any, fallbackError: string): string => {
  if (data && typeof data === 'object' && typeof data.url === 'string') {
    const url = data.url.trim();
    // Only ever navigate to an absolute https Stripe-hosted URL.
    if (/^https:\/\//i.test(url)) return url;
  }
  const message =
    data && typeof data === 'object' && typeof data.error === 'string' && data.error
      ? data.error
      : fallbackError;
  throw new Error(message);
};


export const useSubscription = () => {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [state, setState] = useState<SubscriptionState>(() =>
    userId ? loadingStateFor(userId) : signedOutState,
  );

  // Guards: a response is only applied when it is the newest request AND still
  // belongs to the account that is signed in right now.
  const requestIdRef = useRef(0);
  const ownerRef = useRef<string | null>(userId);
  ownerRef.current = userId;

  const checkStatus = useCallback(async () => {
    const owner = ownerRef.current;
    if (!owner) {
      setState(signedOutState);
      return;
    }

    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current && ownerRef.current === owner;

    try {
      const { data, error } = await supabase.functions.invoke('check-subscription-status');
      if (!isCurrent()) return;

      if (error) {
        console.error('Error checking subscription:', error);
        setState((prev) => applyFailure(prev, owner, 'request_failed'));
        return;
      }

      setState((prev) => applySuccess(prev, owner, data));
    } catch (err) {
      console.error('Error checking subscription:', err);
      if (!isCurrent()) return;
      setState((prev) => applyFailure(prev, owner, 'request_failed'));
    }
  }, []);

  const startCheckout = async (returnUrl?: string) => {
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { cancel_url: returnUrl || window.location.href },
    });

    if (error) {
      console.error('Error creating checkout:', error);
      throw error;
    }

    // A malformed or non-https response is a failure, never a navigation.
    window.location.href = requireRedirectUrl(data, 'Checkout session could not be created');
  };

  const manageSubscription = async () => {
    const { data, error } = await supabase.functions.invoke('create-customer-portal-session', {
      body: { return_url: window.location.href },
    });

    if (error) {
      console.error('Error opening portal:', error);
      throw error;
    }

    // Same-tab navigation: popup blockers reject window.open after an await.
    window.location.href = requireRedirectUrl(data, 'Billing portal could not be opened');
  };


  useEffect(() => {
    // Invalidate anything in flight so a previous account's response can never
    // be rendered against the new one.
    requestIdRef.current++;

    if (!userId) {
      setState(signedOutState);
      return;
    }

    setState((prev) => (prev.ownerId === userId ? { ...prev, loading: true } : loadingStateFor(userId)));

    let cancelled = false;
    const run = () => {
      if (!cancelled) checkStatus();
    };

    const timeout = setTimeout(run, 100);
    const interval = setInterval(run, 60000);

    return () => {
      cancelled = true;
      requestIdRef.current++;
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [userId, checkStatus]);

  const snapshot = state.snapshot;

  return useMemo(
    () => ({
      subscribed: isEntitled(snapshot),
      subscription_status: snapshot?.subscription_status ?? null,
      subscription_end: snapshot?.subscription_end,
      cancel_at_period_end: !!snapshot?.cancel_at_period_end,
      has_billing_account: !!snapshot?.has_billing_account,
      completed_trips: snapshot?.completed_trips ?? 0,
      /** Null when unknown — callers must not render it as 0. */
      connected_trips: connectedTripsOf(state) ?? 0,
      connected_trips_known: connectedTripsOf(state) !== null,
      trips_remaining: tripsRemainingOf(state) ?? 0,
      loading: state.loading,
      /** No confirmed data for this account. */
      unknown: state.unknown,
      /** Newest attempt failed or the server could not confirm with Stripe. */
      stale: state.stale,
      error: state.error,
      checkStatus,
      startCheckout,
      manageSubscription,
      // Fails CLOSED: unknown/stale-without-confirmation does not unlock actions.
      canUseFeatures: canUseFeaturesFor(state),
      hasPremiumAccess: isEntitled(snapshot),
      isPremium: isEntitled(snapshot),
    }),
    [state, snapshot, checkStatus],
  );
};
