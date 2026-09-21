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

export const DEFAULT_CENTER: [number, number] = [-83.0007, 39.9612];
export const DEFAULT_LABEL = "Columbus, Ohio";

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
          settle({
            center: [geo.lng, geo.lat],
            label: geo.label || "Your Area",
          });
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
