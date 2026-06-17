// src/services/placesService.ts
//
// Bar discovery via our own auth-gated serverless proxy (/api/places/*), which
// in turn calls the Google Places API (New). The Google key lives ONLY on the
// server now — the browser never sees it — so a leaked bundle can't be used to
// drain the Places budget. The proxy verifies the user's Firebase token and
// rate-limits per user before spending.

import type { AppBat } from "../pages/Home";
import { postJson } from "./apiClient";

// Public, non-secret flag so the app can still branch to the legacy Mapbox
// fallback / pick the right cache collection. Defaults to enabled.
export const isGooglePlacesEnabled =
  (import.meta.env.VITE_GOOGLE_PLACES_ENABLED as string | undefined) !== "false";

/**
 * Resolve a single free-text line ("Bar Name, 123 Main St, City") to a real
 * place. Used by the bar-list importer. Returns the best match as an AppBat, or
 * null when nothing is found.
 *
 * `bias` softly prefers results near a point (e.g. the current map center) but
 * never excludes a far match, so a list for another city still resolves.
 */
export const searchPlaceByText = async (
  query: string,
  bias?: { lat: number; lng: number }
): Promise<AppBat | null> => {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const { bar } = await postJson<{ bar: AppBat | null }>("/api/proxy", {
    action: "text",
    query: trimmed,
    ...(bias && { bias }),
  });
  return bar;
};

/**
 * Fetch nearby bars/pubs/night clubs around a point. The proxy fans out the
 * parallel category/ranking requests server-side and returns deduped,
 * junk-filtered AppBat objects with real ratings.
 */
export const fetchNearbyBars = async (
  centerLat: number,
  centerLng: number,
  radiusMeters: number
): Promise<AppBat[]> => {
  const { bars } = await postJson<{ bars: AppBat[] }>("/api/proxy", {
    action: "nearby",
    centerLat,
    centerLng,
    radiusMeters,
  });
  return bars;
};
