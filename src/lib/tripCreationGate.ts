/**
 * Canonical gate used by trip creation.
 *
 * Single source of truth = the confirmed subscription state from
 * `useSubscription` (which itself derives from `subscriptionState.ts`).
 *
 * Rules:
 *  - Never treat an unknown / unconfirmed / errored membership as "0 used".
 *  - Entitlement is the canonical one (active flag + active/trialing, or a
 *    trusted admin grant) — never `subscription_active` alone.
 *  - Below the free connection limit, unsubscribed users pass.
 */

import { FREE_CONNECTIONS } from '@/lib/subscriptionState';

export interface MembershipView {
  loading: boolean;
  unknown: boolean;
  confirmed: boolean;
  isPremium: boolean;
  connected_trips: number | null;
  connected_trips_known: boolean;
}

export type TripCreationGate =
  | { status: 'checking' }
  | { status: 'allowed' }
  | { status: 'limit_reached' };

export const evaluateTripCreationGate = (m: MembershipView): TripCreationGate => {
  if (m.confirmed && m.isPremium) return { status: 'allowed' };
  if (m.loading || m.unknown || !m.confirmed || !m.connected_trips_known) {
    return { status: 'checking' };
  }
  if (m.connected_trips === null) return { status: 'checking' };
  return m.connected_trips < FREE_CONNECTIONS
    ? { status: 'allowed' }
    : { status: 'limit_reached' };
};
