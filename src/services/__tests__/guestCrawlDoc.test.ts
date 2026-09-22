import { describe, it, expect } from "vitest";
import { isGuestDocExpired, GUEST_CRAWL_TTL_DAYS } from "../guestCrawlDoc";

const DAY = 24 * 60 * 60 * 1000;

describe("GUEST_CRAWL_TTL_DAYS", () => {
  it("is the 30-day window from the spec", () => {
    expect(GUEST_CRAWL_TTL_DAYS).toBe(30);
  });
});

describe("isGuestDocExpired", () => {
  const now = Date.parse("2026-09-22T00:00:00Z");

  it("is false for a doc expiring in the future", () => {
    expect(isGuestDocExpired(now + DAY, now)).toBe(false);
  });

  it("is false right up to the expiry instant", () => {
    expect(isGuestDocExpired(now, now)).toBe(false);
  });

  it("is true once the expiry has passed", () => {
    expect(isGuestDocExpired(now - 1, now)).toBe(true);
  });

  it("is true for a missing or nonsense expiry", () => {
    expect(isGuestDocExpired(Number.NaN, now)).toBe(true);
    expect(isGuestDocExpired(0, now)).toBe(true);
  });
});
