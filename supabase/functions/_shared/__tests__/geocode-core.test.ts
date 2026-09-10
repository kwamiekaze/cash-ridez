import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ALLOWED_STATE,
  buildNominatimUrl,
  failureMessage,
  MAX_ADDRESS_LENGTH,
  NOMINATIM_MIN_INTERVAL_MS,
  NOMINATIM_REFERER,
  NOMINATIM_USER_AGENT,
  normalizeAddressKey,
  normalizeZip5,
  parseNominatimResult,
  validateAddressInput,
} from '../geocode-core.ts';

const georgiaHit = {
  lat: '33.7490',
  lon: '-84.3880',
  display_name: '123 Peachtree St NE, Atlanta, GA 30303',
  address: { state: 'Georgia', postcode: '30303' },
};

describe('address input validation', () => {
  it('accepts and collapses a normal address', () => {
    expect(validateAddressInput('  123  Peachtree St  ')).toBe('123 Peachtree St');
  });

  it('rejects non-strings, empties, control characters and overlong input', () => {
    expect(validateAddressInput(123)).toBeNull();
    expect(validateAddressInput(null)).toBeNull();
    expect(validateAddressInput('ab')).toBeNull();
    expect(validateAddressInput('123 Main\u0000St')).toBeNull();
    expect(validateAddressInput('a'.repeat(MAX_ADDRESS_LENGTH + 1))).toBeNull();
  });
});

describe('cache key normalization', () => {
  it('is case, whitespace and punctuation insensitive', () => {
    expect(normalizeAddressKey('123 Peachtree St. NE, Atlanta, GA'))
      .toBe(normalizeAddressKey('  123   peachtree st ne atlanta ga  '));
  });

  it('keeps different addresses distinct', () => {
    expect(normalizeAddressKey('123 Peachtree St')).not.toBe(normalizeAddressKey('124 Peachtree St'));
  });
});

describe('ZIP normalization', () => {
  it('returns a five digit ZIP, including from ZIP+4', () => {
    expect(normalizeZip5('30303')).toBe('30303');
    expect(normalizeZip5(' 30303-1234 ')).toBe('30303');
  });

  it('rejects anything that is not a ZIP', () => {
    expect(normalizeZip5('3030')).toBeNull();
    expect(normalizeZip5(null)).toBeNull();
    expect(normalizeZip5({})).toBeNull();
  });
});

describe('Nominatim result parsing', () => {
  it('accepts a Georgia result with finite coordinates and a ZIP', () => {
    const parsed = parseNominatimResult(georgiaHit);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.result).toEqual({
        lat: 33.749,
        lng: -84.388,
        zip: '30303',
        displayName: georgiaHit.display_name,
      });
    }
  });

  it('rejects results outside the Georgia service area', () => {
    const parsed = parseNominatimResult({
      ...georgiaHit,
      address: { state: 'New York', postcode: '10001' },
    });
    expect(parsed).toEqual({ ok: false, reason: 'out_of_area' });
  });

  it('rejects a Georgia result with no ZIP', () => {
    const parsed = parseNominatimResult({ ...georgiaHit, address: { state: 'Georgia' } });
    expect(parsed).toEqual({ ok: false, reason: 'no_zip' });
  });

  it('rejects non-finite or out-of-range coordinates', () => {
    expect(parseNominatimResult({ ...georgiaHit, lat: 'abc' }).ok).toBe(false);
    expect(parseNominatimResult({ ...georgiaHit, lat: '910' }).ok).toBe(false);
    expect(parseNominatimResult(null).ok).toBe(false);
  });

  it('never yields a default coordinate', () => {
    const parsed = parseNominatimResult({});
    expect(parsed.ok).toBe(false);
  });
});

describe('upstream request shape and policy', () => {
  it('sends the documented query parameters', () => {
    const url = new URL(buildNominatimUrl('123 Peachtree St'));
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(url.searchParams.get('addressdetails')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(url.searchParams.get('countrycodes')).toBe('us');
    expect(url.searchParams.get('q')).toBe('123 Peachtree St');
  });

  it('identifies CashRidez and honours one request per second', () => {
    expect(NOMINATIM_USER_AGENT).toContain('cashridez.com');
    expect(NOMINATIM_REFERER).toBe('https://cashridez.com');
    expect(NOMINATIM_MIN_INTERVAL_MS).toBe(1000);
    expect(ALLOWED_STATE).toBe('Georgia');
  });

  it('gives a user friendly message for every failure', () => {
    for (const reason of ['invalid_input', 'not_found', 'out_of_area', 'no_zip', 'upstream_error', 'rate_limited'] as const) {
      expect(failureMessage(reason).length).toBeGreaterThan(10);
      expect(failureMessage(reason)).not.toMatch(/nominatim/i);
    }
  });
});

describe('trip creation no longer fakes a location', () => {
  const page = readFileSync('src/pages/CreateRideRequest.tsx', 'utf8');

  it('has no hardcoded New York coordinates or ZIP', () => {
    expect(page).not.toContain('10001');
    expect(page).not.toContain('40.7128');
    expect(page).not.toContain('-74.006');
  });

  it('resolves both addresses through the server function, sequentially', () => {
    expect(page).toContain('geocode-address');
    expect(page).toContain('await geocodeAddress(formData.pickupAddress.trim(), "Pickup")');
    expect(page).toContain('await geocodeAddress(formData.dropoffAddress.trim(), "Dropoff")');
    expect(page).not.toContain("invoke('send-new-trip-notification'");
  });
});

describe('the geocoding function fails closed', () => {
  const fn = readFileSync('supabase/functions/geocode-address/index.ts', 'utf8');

  it('requires a user JWT and reserves the global rate-limit slot', () => {
    expect(fn).toContain('getClaims');
    expect(fn).toContain('reserve_geocode_slot');
    expect(fn).toContain('geocode_cache');
  });

  it('never returns a fallback coordinate', () => {
    expect(fn).not.toMatch(/lat:\s*4?0?\.?7128/);
    expect(fn).toContain('return fail(parsed.reason)');
  });
});
