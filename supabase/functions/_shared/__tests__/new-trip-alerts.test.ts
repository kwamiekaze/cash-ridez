import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  evaluateNewTripEligibility,
  evaluateNewTripInAppEligibility,
} from '../email/eligibility.ts';

const verifiedDriver = {
  id: 'driver-1',
  email: 'driver@example.com',
  is_driver: true,
  is_verified: true,
  subscription_active: false,
  subscription_status: null,
  notification_preferences: { new_trips: true },
};

describe('in-app new-trip eligibility', () => {
  it('does not require an email address', () => {
    const verdict = evaluateNewTripInAppEligibility({ ...verifiedDriver, email: null });
    expect(verdict.eligible).toBe(true);
  });

  it('does not require a subscription', () => {
    expect(evaluateNewTripInAppEligibility(verifiedDriver).eligible).toBe(true);
  });

  it('honours all_notifications, new_trips and new_offers', () => {
    for (const prefs of [{ all_notifications: true }, { new_trips: true }, { new_offers: true }]) {
      const verdict = evaluateNewTripInAppEligibility({
        ...verifiedDriver,
        notification_preferences: { new_trips: false, new_offers: false, ...prefs },
      });
      expect(verdict.eligible).toBe(true);
    }
  });

  it('excludes a driver who turned both trip preferences off', () => {
    const verdict = evaluateNewTripInAppEligibility({
      ...verifiedDriver,
      notification_preferences: { all_notifications: false, new_trips: false, new_offers: false },
    });
    expect(verdict).toEqual({ eligible: false, reason: 'preference_off' });
  });

  it('excludes unverified users, non-drivers and the rider themselves', () => {
    expect(evaluateNewTripInAppEligibility({ ...verifiedDriver, is_verified: false }).reason).toBe('not_verified');
    expect(evaluateNewTripInAppEligibility({ ...verifiedDriver, is_driver: false }).reason).toBe('not_driver');
    expect(evaluateNewTripInAppEligibility(verifiedDriver, { riderId: 'driver-1' }).reason).toBe('is_rider');
  });
});

describe('email new-trip eligibility still needs a mailbox, not a subscription', () => {
  it('includes an unsubscribed verified driver with an email', () => {
    expect(evaluateNewTripEligibility(verifiedDriver).eligible).toBe(true);
  });

  it('excludes a driver with no email', () => {
    expect(evaluateNewTripEligibility({ ...verifiedDriver, email: null }).reason).toBe('no_email');
  });
});

describe('worker fan-out wiring', () => {
  const worker = readFileSync('supabase/functions/process-email-notifications/index.ts', 'utf8');

  it('inserts in-app alerts through the idempotent database routine', () => {
    expect(worker).toContain('notifyNearbyDriversInApp');
    expect(worker).toContain('rpc("insert_new_trip_notifications"');
    expect(worker).toContain('type: "new_trip"');
    // The partial index cannot be inferred by PostgREST's onConflict.
    expect(worker).not.toContain('ignoreDuplicates');
  });

  it('uses the shared nearby ZIP rule for both channels', () => {
    expect(worker).toContain('isNearbyZip(row.current_zip, ride.pickup_zip)');
    expect(worker).toContain('nearbyAvailableDriverIds');
  });
});

describe('legacy notification function is locked down', () => {
  const fn = readFileSync('supabase/functions/send-new-trip-notification/index.ts', 'utf8');

  it('requires the caller to be the ride owner and ignores client fields', () => {
    expect(fn).toContain('getClaims');
    expect(fn).toContain("ride.rider_id !== callerId");
    expect(fn).toContain('const pickup_zip = ride.pickup_zip;');
  });
});
