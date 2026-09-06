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

const isState = (value: any): value is SubscriptionState =>
  !!value && typeof value === 'object' && 'ownerId' in value && 'unknown' in value;

/**
 * Canonical entitlement predicate.
 *
 * Accepts a snapshot or a full state. When given a state, entitlement requires
 * a CONFIRMED snapshot for that account: an unconfirmed (first, stale)
 * premium-looking response is displayable but never unlocking.
 */
export function isEntitled(
  input: SubscriptionSnapshot | SubscriptionState | null | undefined,
): boolean {
  if (isState(input)) {
    return isConfirmed(input) && isEntitled(input.snapshot);
  }
  const snapshot = input;
  if (!snapshot) return false;
  if (!snapshot.subscribed) return false;
  const status = snapshot.subscription_status;
  if (status === null || status === undefined) return false;
  // Admin-granted access is stored as the 'premium' status.
  if (status === 'premium') return true;
  return ENTITLED_STATUSES.has(status);
}

/** Strict non-negative integer, or null. NaN/Infinity/negatives are rejected. */
const asCount = (value: unknown): number | null => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.floor(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.floor(parsed);
  }
  return null;
};

/**
 * Parse a server payload into a snapshot.
 * Returns null when the payload cannot be trusted — a malformed counter must
 * never be coerced to 0, because 0 reads as "no connections used yet".
 */
export const parseSnapshot = (data: any): SubscriptionSnapshot | null => {
  if (!data || typeof data !== 'object') return null;

  const connected = asCount(data.connected_trips);
  if (connected === null) return null;

  const completed = asCount(data.completed_trips) ?? 0;

  const status = typeof data.subscription_status === 'string' && data.subscription_status !== ''
    ? data.subscription_status
    : null;

  const end = typeof data.subscription_end === 'string' && data.subscription_end !== ''
    ? data.subscription_end
    : undefined;

  const remaining: number | 'unlimited' =
    data.trips_remaining === 'unlimited'
      ? 'unlimited'
      : Math.max(0, FREE_CONNECTIONS - connected);

  return {
    subscribed: data.subscribed === true,
    subscription_status: status,
    subscription_end: end,
    cancel_at_period_end: data.cancel_at_period_end === true,
    has_billing_account: data.has_billing_account === true,
    completed_trips: completed,
    connected_trips: connected,
    trips_remaining: remaining,
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
    const priorConfirmed = prev.ownerId === ownerId && prev.snapshot && !prev.unknown
      ? prev.snapshot
      : null;
    const retained = priorConfirmed ?? snapshot;
    return {
      ownerId,
      snapshot: retained,
      loading: false,
      stale: true,
      // Confirmed only when a previously CONFIRMED snapshot for this same
      // account is being retained. A first stale response is displayable but
      // remains unknown, so it can never unlock limited actions.
      unknown: !(prev.ownerId === ownerId && !!prev.snapshot && !prev.unknown),
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
  // Only a CONFIRMED snapshot for the same account may be retained; an
  // unconfirmed (stale) snapshot must not become confirmed via a later failure.
  const sameOwnerConfirmed = prev.ownerId === ownerId && !!prev.snapshot && !prev.unknown;
  const retained = sameOwnerConfirmed ? prev.snapshot : null;
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
 * Narrow a stored state to the account currently signed in.
 *
 * Rendering is always done through this: if the state belongs to a different
 * account (or to nobody), the caller sees an unknown state instead of the
 * previous user's membership.
 */
export const stateForOwner = (
  state: SubscriptionState,
  ownerId: string | null,
): SubscriptionState => {
  if (!ownerId) return signedOutState;
  if (state.ownerId !== ownerId) return loadingStateFor(ownerId);
  return state;
};

/** True only when a snapshot for THIS account was confirmed by the server. */
export const isConfirmed = (state: SubscriptionState): boolean =>
  !!state.snapshot && !state.unknown;

/**
 * Feature gate. Fails CLOSED: without a confirmed snapshot for this account,
 * limited actions are not allowed.
 */
export const canUseFeatures = (state: SubscriptionState): boolean => {
  if (!isConfirmed(state)) return false;
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
