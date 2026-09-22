// src/hooks/useInitialCenter.ts
//
// Resolves the map centre for the first paint of /home.
//
// Precedence:
//   1. Precise coords the browser granted on a previous visit (localStorage,
//      written by useLocationPermission)
//   2. Coarse city from /api/geo, derived from Vercel's edge IP headers
//   3. Columbus, Ohio — the historical hardcoded default, now a last resort
//
// Home gates its first bar fetch on `resolved`. Without that gate it would
// fetch the Columbus default on mount and then fetch again for the visitor's
// real city — two billed Places calls for every visit.

import { useEffect, useRef, useState } from "react";
import { SEED_METROS } from "../data/seedMetros";

export const DEFAULT_CENTER: [number, number] = [-83.0007, 39.9612];
export const DEFAULT_LABEL = "Columbus, Ohio";

// A seeded metro covers a 2-mile disc (SEARCH_RADIUS_MILES in
// barCacheService.ts / CACHE_RADIUS_MILES in api/proxy.ts), but an IP-geo
// centre can land 8-11 miles off the city point — measured in production on
// 2026-09-22, where a west-London centre missed seed-london-uk by 8.4 miles
// and billed a fresh Places call. Snapping a coarse centre onto the metro it
// clearly belongs to turns that into a free cache hit.
//
// 15 miles is wide enough for the sprawl of London, NYC and LA and narrow
// enough that a genuinely different town is never mistaken for a seeded one.
const SNAP_RADIUS_MILES = 15;

const milesBetween = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** Nearest seeded metro within SNAP_RADIUS_MILES, or null. */
export const snapToSeedMetro = (
  lng: number,
  lat: number
): { center: [number, number]; label: string } | null => {
  let best: { center: [number, number]; label: string } | null = null;
  let bestMiles = SNAP_RADIUS_MILES;
  for (const metro of SEED_METROS) {
    const miles = milesBetween(lat, lng, metro.lat, metro.lng);
    if (miles <= bestMiles) {
      bestMiles = miles;
      best = { center: [metro.lng, metro.lat], label: metro.name };
    }
  }
  return best;
};

/** A slow, offline or ad-blocked /api/geo must never hold the map hostage. */
const GEO_TIMEOUT_MS = 2000;

export interface InitialCenter {
  center: [number, number];
  label: string;
  /** Flips true once a centre is settled — Home's first fetch waits on this. */
  resolved: boolean;
}

const readCachedCoords = (): [number, number] | null => {
  try {
    const raw = localStorage.getItem("userLocation");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      Number.isFinite(parsed[0]) &&
      Number.isFinite(parsed[1])
    ) {
      return [parsed[0], parsed[1]];
    }
  } catch {
    /* corrupt entry — fall through to the geo path */
  }
  return null;
};

export const useInitialCenter = (): InitialCenter => {
  const [state, setState] = useState<InitialCenter>(() => {
    // A returning visitor who already granted location skips the geo call
    // entirely: we know where they are, so the map can paint immediately.
    const cached = readCachedCoords();
    return cached
      ? { center: cached, label: "Your Location", resolved: true }
      : { center: DEFAULT_CENTER, label: DEFAULT_LABEL, resolved: false };
  });
  const started = useRef(state.resolved);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS);

    // Every exit path must resolve, or Home never fetches and the map stays
    // empty. On failure we keep whatever centre state already holds.
    const settle = (next?: Partial<InitialCenter>) => {
      if (cancelled) return;
      setState((prev) => ({ ...prev, ...next, resolved: true }));
    };

    fetch("/api/geo", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((geo) => {
        if (
          geo?.available &&
          Number.isFinite(geo.lat) &&
          Number.isFinite(geo.lng)
        ) {
          // An IP centre is coarse by nature, so nudging it onto the metro it
          // belongs to costs the visitor nothing and buys a free cache hit.
          // Precise coords from a granted permission are never snapped — they
          // short-circuit in the initial state and never reach this branch.
          const snapped = snapToSeedMetro(geo.lng, geo.lat);
          settle(
            snapped
              ? { center: snapped.center, label: snapped.label }
              : { center: [geo.lng, geo.lat], label: geo.label || "Your Area" }
          );
        } else {
          settle();
        }
      })
      .catch(() => settle())
      .finally(() => clearTimeout(timer));

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return state;
};
