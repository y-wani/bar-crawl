import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { isCacheValid } from '../barCacheService';

const hoursAgo = (h: number) =>
  Timestamp.fromDate(new Date(Date.now() - h * 60 * 60 * 1000));

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
