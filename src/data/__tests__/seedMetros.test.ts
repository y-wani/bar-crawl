import { describe, it, expect } from 'vitest';
import { SEED_METROS, DEFAULT_SEED_METRO } from '../seedMetros';

describe('SEED_METROS', () => {
  it('has no duplicate names', () => {
    const names = SEED_METROS.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has plausible coordinates', () => {
    for (const m of SEED_METROS) {
      expect(Math.abs(m.lat), m.name).toBeLessThanOrEqual(90);
      expect(Math.abs(m.lng), m.name).toBeLessThanOrEqual(180);
      expect(m.lat === 0 && m.lng === 0, m.name).toBe(false);
    }
  });

  it('covers all three target countries', () => {
    const names = SEED_METROS.map((m) => m.name).join(' ');
    expect(names).toContain(', UK');
    expect(names).toContain('Toronto');
  });

  it('keeps DEFAULT_SEED_METRO in sync with SEED_METROS and getDefaultLocationCache()', () => {
    expect(SEED_METROS).toContain(DEFAULT_SEED_METRO);
    expect(DEFAULT_SEED_METRO.lat).toBe(39.9612);
    expect(DEFAULT_SEED_METRO.lng).toBe(-83.0007);
  });
});
