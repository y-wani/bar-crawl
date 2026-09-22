// src/services/guestCrawlStorage.ts
//
// The guest's crawl, kept on the device. This is the PRIMARY persistence layer
// for a crawl built without an account (spec §6.1) and it also fixes
// refresh-loses-your-crawl for signed-in users, which was a live bug.
//
// There is deliberately NO TTL. Expiring a visitor's own work to pressure them
// into signing up is a dark pattern and was explicitly rejected in the spec.
// The 30-day window lives only on the server-side durability doc.
//
// Every read and write is wrapped: localStorage throws in private-mode Safari
// and can be disabled outright, and losing a crawl must never take the page
// down with it.

import type { AppBat } from "../pages/Home";

export const GUEST_CRAWL_KEY = "bh_guest_crawl";

export interface GuestCrawl {
  selectedBars: AppBat[];
  mapCenter: [number, number];
  searchRadius: number;
  crawlName?: string;
  /** Where the crawl starts and ends. Without these a restore falls through to
   *  Route's getCurrentLocation() branch and silently replaces the anchors the
   *  visitor typed with wherever they happen to be standing. */
  startCoordinates?: [number, number];
  endCoordinates?: [number, number];
  /** epoch ms — informational only, never used to expire the crawl */
  updatedAt: number;
}

const isCoordinatePair = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((n) => typeof n === "number" && Number.isFinite(n));

export const isValidGuestCrawl = (value: unknown): value is GuestCrawl => {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<GuestCrawl>;
  if (!Array.isArray(c.selectedBars)) return false;
  // A route needs at least two stops; anything less can't be restored into
  // /route anyway — Route.tsx would bounce it straight back to /home.
  if (c.selectedBars.length < 2) return false;
  if (!c.selectedBars.every((b) => b && typeof (b as AppBat).id === "string")) {
    return false;
  }
  if (!isCoordinatePair(c.mapCenter)) return false;
  if (typeof c.searchRadius !== "number" || !Number.isFinite(c.searchRadius)) {
    return false;
  }
  if (c.crawlName !== undefined && typeof c.crawlName !== "string") return false;
  if (c.startCoordinates !== undefined && !isCoordinatePair(c.startCoordinates)) {
    return false;
  }
  if (c.endCoordinates !== undefined && !isCoordinatePair(c.endCoordinates)) {
    return false;
  }
  return true;
};

export const readGuestCrawl = (): GuestCrawl | null => {
  try {
    const raw = localStorage.getItem(GUEST_CRAWL_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidGuestCrawl(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const writeGuestCrawl = (crawl: Omit<GuestCrawl, "updatedAt">): void => {
  try {
    const payload: GuestCrawl = { ...crawl, updatedAt: Date.now() };
    if (!isValidGuestCrawl(payload)) return;
    localStorage.setItem(GUEST_CRAWL_KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable or full — the in-memory crawl still works */
  }
};

export const clearGuestCrawl = (): void => {
  try {
    localStorage.removeItem(GUEST_CRAWL_KEY);
  } catch {
    /* nothing to do */
  }
};
