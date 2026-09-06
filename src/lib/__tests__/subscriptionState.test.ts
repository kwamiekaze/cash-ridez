import { describe, it, expect } from 'vitest';
import {
  applyFailure,
  applySuccess,
  canUseFeatures,
  connectedTrips,
  isEntitled,
  loadingStateFor,
  signedOutState,
  tripsRemaining,
} from '../subscriptionState';

const success = (over: any = {}) => ({
  subscribed: true,
  subscription_status: 'active',
  cancel_at_period_end: false,
  has_billing_account: true,
  completed_trips: 4,
  connected_trips: 9,
  trips_remaining: 'unlimited',
  ...over,
});

describe('entitlement predicate', () => {
  it('requires an entitling status, not just the flag', () => {
    expect(isEntitled({ ...success(), subscription_status: 'canceled' } as any)).toBe(false);
    expect(isEntitled({ ...success(), subscription_status: 'past_due' } as any)).toBe(false);
    expect(isEntitled(success() as any)).toBe(true);
    expect(isEntitled({ ...success(), subscription_status: 'trialing' } as any)).toBe(true);
  });

  it('honours an admin grant', () => {
    expect(isEntitled({ ...success(), subscription_status: 'premium' } as any)).toBe(true);
  });
});

describe('unknown and stale states', () => {
  it('never turns an unknown state into 0 connections', () => {
    const state = loadingStateFor('user-1');
    expect(connectedTrips(state)).toBeNull();
    expect(tripsRemaining(state)).toBeNull();
    expect(canUseFeatures(state)).toBe(false);
  });

  it('fails closed after a failed fetch with no prior confirmation', () => {
    const state = applyFailure(loadingStateFor('user-1'), 'user-1', 'request_failed');
    expect(state.unknown).toBe(true);
    expect(canUseFeatures(state)).toBe(false);
  });

  it('retains the last confirmed snapshot for the same account and marks it stale', () => {
    const confirmed = applySuccess(loadingStateFor('user-1'), 'user-1', success({ connected_trips: 1, subscribed: false, subscription_status: 'canceled', trips_remaining: 2 }));
    const failed = applyFailure(confirmed, 'user-1', 'request_failed');
    expect(failed.stale).toBe(true);
    expect(failed.unknown).toBe(false);
    expect(connectedTrips(failed)).toBe(1);
    expect(canUseFeatures(failed)).toBe(true);
  });

  it('discards a snapshot belonging to a different account', () => {
    const confirmed = applySuccess(loadingStateFor('user-1'), 'user-1', success());
    const switched = applyFailure(confirmed, 'user-2', 'request_failed');
    expect(switched.snapshot).toBeNull();
    expect(switched.unknown).toBe(true);
    expect(canUseFeatures(switched)).toBe(false);
  });

  it('treats a server stale flag as unconfirmed', () => {
    const state = applySuccess(loadingStateFor('user-1'), 'user-1', {
      ...success(),
      stale: true,
      retryable_error: 'stripe_unavailable',
    });
    expect(state.stale).toBe(true);
    expect(state.error).toBe('stripe_unavailable');
  });

  it('treats a malformed success as a failure, not a reset to free', () => {
    const confirmed = applySuccess(loadingStateFor('user-1'), 'user-1', success({ connected_trips: 5 }));
    const bad = applySuccess(confirmed, 'user-1', { subscribed: false });
    expect(bad.stale).toBe(true);
    expect(connectedTrips(bad)).toBe(5);
  });

  it('signed out is unknown and gated', () => {
    expect(canUseFeatures(signedOutState)).toBe(false);
  });
});

describe('free quota gating', () => {
  it('blocks a confirmed non-member at three connections', () => {
    const state = applySuccess(loadingStateFor('u'), 'u', success({
      subscribed: false,
      subscription_status: 'canceled',
      connected_trips: 3,
      trips_remaining: 0,
    }));
    expect(canUseFeatures(state)).toBe(false);
  });

  it('allows a confirmed member regardless of connections', () => {
    const state = applySuccess(loadingStateFor('u'), 'u', success({ connected_trips: 50 }));
    expect(canUseFeatures(state)).toBe(true);
    expect(tripsRemaining(state)).toBe('unlimited');
  });
});
