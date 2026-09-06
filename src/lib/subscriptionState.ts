/**
 * Canonical client-side subscription state.
 *
 * Rules encoded here (all unit tested):
 *  - Entitlement is `subscription_active` AND a status of active/trialing, or a
 *    trusted admin grant (`premium` with no Stripe subscription). The boolean
 *    flag alone is never enough.
 *  - An unknown / failed / stale fetch NEVER becomes "0 connections used" and
 *    never unlocks limited actions. Gating fails CLOSED.
 *  - The last CONFIRMED snapshot for the SAME account is retained across a
 *    failed refresh, and is reported as stale — never as a fresh success.
 *  - Every snapshot carries the account it belongs to, so switching accounts
 *    cannot briefly render the previous user's premium state.
 */

export const FREE_CONNECTIONS = 3;

export interface SubscriptionSnapshot {
  subscribed: boolean;
  subscription_status: string | null;
  subscription_end?: string;
  cancel_at_period_end: boolean;
  has_billing_account: boolean;
  completed_trips: number;
  connected_trips: number;
  trips_remaining: number | 'unlimited';
}

export interface SubscriptionState {
  /** Account the snapshot belongs to. Null means "no account resolved yet". */
  ownerId: string | null;
  /** Last CONFIRMED server snapshot for ownerId, or null when never confirmed. */
  snapshot: SubscriptionSnapshot | null;
  loading: boolean;
  /** True when the newest attempt failed or the server flagged it stale. */
  stale: boolean;
  /** True when no confirmed snapshot exists for this account. */
  unknown: boolean;
  error?: string;
}

export const signedOutState: SubscriptionState = {
  ownerId: null,
  snapshot: null,
  loading: false,
  stale: false,
  unknown: true,
};

export const loadingStateFor = (ownerId: string): SubscriptionState => ({
  ownerId,
  snapshot: null,
  loading: true,
  stale: false,
  unknown: true,
});

const ENTITLED_STATUSES = new Set(['active', 'trialing']);

/** Canonical entitlement predicate. */
export const isEntitled = (snapshot: SubscriptionSnapshot | null | undefined): boolean => {
  if (!snapshot) return false;
  if (!snapshot.subscribed) return false;
  const status = snapshot.subscription_status;
  if (status === null || status === undefined) return false;
  // Admin-granted access is stored as the 'premium' status.
  if (status === 'premium') return true;
  return ENTITLED_STATUSES.has(status);
};

export const parseSnapshot = (data: any): SubscriptionSnapshot | null => {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.connected_trips !== 'number') return null;
  return {
    subscribed: !!data.subscribed,
    subscription_status: data.subscription_status ?? null,
    subscription_end: data.subscription_end ?? undefined,
    cancel_at_period_end: !!data.cancel_at_period_end,
    has_billing_account: !!data.has_billing_account,
    completed_trips: Number(data.completed_trips ?? 0) || 0,
    connected_trips: Number(data.connected_trips) || 0,
    trips_remaining: data.trips_remaining === 'unlimited'
      ? 'unlimited'
      : Math.max(0, FREE_CONNECTIONS - (Number(data.connected_trips) || 0)),
  };
};

/** Apply a successful server response. Honours the server's stale flag. */
export const applySuccess = (
  prev: SubscriptionState,
  ownerId: string,
  data: any,
): SubscriptionState => {
  const snapshot = parseSnapshot(data);
  const serverStale = !!data?.stale || !!data?.retryable_error;

  if (!snapshot) {
    // Malformed but "successful" response is an error, not a reset.
    return applyFailure(prev, ownerId, 'malformed_response');
  }

  if (serverStale) {
    // The server could not confirm against Stripe. Keep the previous confirmed
    // snapshot when we have one; otherwise adopt the DB state but mark it stale.
    const retained = prev.ownerId === ownerId && prev.snapshot ? prev.snapshot : snapshot;
    return {
      ownerId,
      snapshot: retained,
      loading: false,
      stale: true,
      unknown: prev.ownerId === ownerId ? prev.unknown && !prev.snapshot : false,
      error: String(data?.retryable_error ?? 'stale'),
    };
  }

  return { ownerId, snapshot, loading: false, stale: false, unknown: false };
};

/** Apply a failed refresh: retain the last confirmed state, mark stale. */
export const applyFailure = (
  prev: SubscriptionState,
  ownerId: string,
  error: string,
): SubscriptionState => {
  const retained = prev.ownerId === ownerId ? prev.snapshot : null;
  return {
    ownerId,
    snapshot: retained,
    loading: false,
    stale: true,
    unknown: !retained,
    error,
  };
};

/**
 * Feature gate. Fails CLOSED: without a confirmed snapshot for this account,
 * limited actions are not allowed.
 */
export const canUseFeatures = (state: SubscriptionState): boolean => {
  if (!state.snapshot) return false;
  if (isEntitled(state.snapshot)) return true;
  return state.snapshot.connected_trips < FREE_CONNECTIONS;
};

/** Connections used, or null when unknown (never silently 0). */
export const connectedTrips = (state: SubscriptionState): number | null =>
  state.snapshot ? state.snapshot.connected_trips : null;

export const tripsRemaining = (state: SubscriptionState): number | 'unlimited' | null => {
  if (!state.snapshot) return null;
  if (isEntitled(state.snapshot)) return 'unlimited';
  return Math.max(0, FREE_CONNECTIONS - state.snapshot.connected_trips);
};
