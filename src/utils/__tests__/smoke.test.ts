import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('runs and has localStorage from jsdom', () => {
    localStorage.setItem('probe', 'ok');
    expect(localStorage.getItem('probe')).toBe('ok');
  });
});
