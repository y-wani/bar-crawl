import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { isCacheValid, findCachedMatch } from '../barCacheService';

const hoursAgo = (h: number) =>
  Timestamp.fromDate(new Date(Date.now() - h * 60 * 60 * 1000));

// Columbus, OH — used as the query center for findCachedMatch tests.
const CENTER_LAT = 39.9612;
const CENTER_LNG = -83.0007;

const makeArea = (overrides: Partial<{
  centerLat: number;
  centerLng: number;
  fetchedAt: Timestamp;
  seeded: boolean;
}> = {}) => ({
  centerLat: overrides.centerLat ?? CENTER_LAT,
  centerLng: overrides.centerLng ?? CENTER_LNG,
  radius: 2,
  bars: [{ id: 'bar-1', name: 'Test Bar' }] as unknown as import('../../pages/Home').AppBat[],
  fetchedAt: overrides.fetchedAt ?? hoursAgo(1),
  location: 'Columbus, OH',
  seeded: overrides.seeded ?? false,
});

describe('isCacheValid', () => {
  it('accepts unseeded cache under 24h', () => {
    expect(isCacheValid(hoursAgo(23), false)).toBe(true);
  });

  it('rejects unseeded cache over 24h', () => {
    expect(isCacheValid(hoursAgo(25), false)).toBe(false);
  });

  it('accepts seeded cache well past 24h', () => {
    expect(isCacheValid(hoursAgo(24 * 20), true)).toBe(true);
  });

  it('rejects seeded cache past 30 days', () => {
    expect(isCacheValid(hoursAgo(24 * 31), true)).toBe(false);
  });

  it('defaults to the unseeded window when the flag is absent', () => {
    expect(isCacheValid(hoursAgo(25))).toBe(false);
  });
});

describe('findCachedMatch', () => {
  it('returns a seeded entry more than 24h old but under 30 days', () => {
    const areas = [makeArea({ seeded: true, fetchedAt: hoursAgo(24 * 10) })];
    const result = findCachedMatch(areas, CENTER_LAT, CENTER_LNG, 2);
    expect(result).not.toBeNull();
    expect(result?.isFromCache).toBe(true);
  });

  it('does not return an unseeded entry more than 24h old', () => {
    const areas = [makeArea({ seeded: false, fetchedAt: hoursAgo(25) })];
    const result = findCachedMatch(areas, CENTER_LAT, CENTER_LNG, 2);
    expect(result).toBeNull();
  });

  it('does not return an entry outside the search radius even when valid', () => {
    // ~69 miles north of Columbus — well outside a 2-mile radius.
    const areas = [makeArea({ centerLat: CENTER_LAT + 1, centerLng: CENTER_LNG, fetchedAt: hoursAgo(1) })];
    const result = findCachedMatch(areas, CENTER_LAT, CENTER_LNG, 2);
    expect(result).toBeNull();
  });

  it('returns no match for an empty document list', () => {
    const result = findCachedMatch([], CENTER_LAT, CENTER_LNG, 2);
    expect(result).toBeNull();
  });
});
