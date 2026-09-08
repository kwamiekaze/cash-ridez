import { describe, expect, it } from 'vitest';
import {
  NEARBY_RADIUS_MI,
  ZIP_CENTROIDS,
  getZipDistance,
  isNearbyZip,
  isSameScf,
  normalizeZip,
} from '../geo.ts';

describe('geo helpers', () => {
  it('normalizes ZIP inputs', () => {
    expect(normalizeZip('30303')).toBe('30303');
    expect(normalizeZip(' 30303-1234 ')).toBe('30303');
    expect(normalizeZip(30303)).toBe('30303');
    expect(normalizeZip('abc')).toBeNull();
    expect(normalizeZip(null)).toBeNull();
    expect(normalizeZip(undefined)).toBeNull();
  });

  it('uses the 25 mile default radius', () => {
    expect(NEARBY_RADIUS_MI).toBe(25);
  });

  it('computes centroid distance only for known ZIPs', () => {
    expect(getZipDistance('30303', '30303')).toBe(0);
    const d = getZipDistance('30303', '30309');
    expect(d).not.toBeNull();
    expect(d as number).toBeGreaterThan(0);
    expect(d as number).toBeLessThan(25);
    expect(getZipDistance('30303', '99999')).toBeNull();
    expect(getZipDistance('30303', null)).toBeNull();
  });

  it('detects same 3-digit SCF', () => {
    expect(isSameScf('30303', '30399')).toBe(true);
    expect(isSameScf('30303', '30144')).toBe(false);
    expect(isSameScf('30303', null)).toBe(false);
  });

  it('treats nearby centroids as nearby', () => {
    expect(isNearbyZip('30309', '30303')).toBe(true);
  });

  it('falls back to SCF when a centroid is missing', () => {
    const unknown = '30399';
    expect(ZIP_CENTROIDS[unknown]).toBeUndefined();
    expect(isNearbyZip(unknown, '30303')).toBe(true);
  });

  it('rejects far ZIPs with different SCFs', () => {
    expect(isNearbyZip('30180', '30319')).toBe(false);
    expect(isNearbyZip('99999', '30303')).toBe(false);
    expect(isNearbyZip(null, '30303')).toBe(false);
  });

  it('honors a custom radius', () => {
    expect(isNearbyZip('30309', '30303', 0.01)).toBe(true); // same SCF fallback
    expect(isNearbyZip('30060', '30319', 0.01)).toBe(false);
  });
});
