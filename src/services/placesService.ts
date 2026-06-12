// src/services/placesService.ts
//
// Bar discovery via the Google Places API (New) — real ratings, review
// counts, addresses, and open-now status. Falls back to the legacy Mapbox
// category search at the call sites when no API key is configured.

import type { AppBat } from "../pages/Home";

const GOOGLE_PLACES_API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as
  | string
  | undefined;

export const isGooglePlacesEnabled = Boolean(GOOGLE_PLACES_API_KEY);

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchNearby";

// Only fields we ask for are billed — keep the mask tight
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.formattedAddress",
  "places.currentOpeningHours.openNow",
  "places.priceLevel",
].join(",");

interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  formattedAddress?: string;
  currentOpeningHours?: { openNow?: boolean };
  priceLevel?: string;
}

const PRICE_TEXT: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

const milesBetween = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// One searchNearby request (the API caps each at 20 results)
const searchNearbyOnce = async (
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
  includedPrimaryTypes: string[],
  rankPreference: "POPULARITY" | "DISTANCE"
): Promise<GooglePlace[]> => {
  const response = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      // Primary types only — keeps taco joints with a bar counter out of
      // a bar crawl app's results
      includedPrimaryTypes,
      maxResultCount: 20,
      rankPreference,
      locationRestriction: {
        circle: {
          center: { latitude: centerLat, longitude: centerLng },
          radius: Math.min(50000, Math.max(1000, radiusMeters)),
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Places API error ${response.status}: ${body}`);
  }

  const data: { places?: GooglePlace[] } = await response.json();
  return data.places ?? [];
};

/**
 * Fetch nearby bars/pubs/night clubs around a point.
 *
 * searchNearby returns at most 20 places per request, which badly
 * under-covers dense cities (e.g. Chicago). We fan out parallel requests
 * split by category and ranking, then dedupe by place id — up to ~80
 * unique venues per area.
 *
 * Returns AppBat objects with real ratings and metadata. Objects contain
 * no `undefined` values (Firestore cache rejects them).
 */
export const fetchNearbyBars = async (
  centerLat: number,
  centerLng: number,
  radiusMeters: number
): Promise<AppBat[]> => {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error("Google Places API key is not configured");
  }

  const requests: Array<{
    types: string[];
    rank: "POPULARITY" | "DISTANCE";
  }> = [
    { types: ["bar", "wine_bar"], rank: "POPULARITY" },
    { types: ["bar", "wine_bar"], rank: "DISTANCE" },
    { types: ["pub"], rank: "POPULARITY" },
    { types: ["night_club"], rank: "POPULARITY" },
  ];

  const results = await Promise.allSettled(
    requests.map((r) =>
      searchNearbyOnce(centerLat, centerLng, radiusMeters, r.types, r.rank)
    )
  );

  const seen = new Set<string>();
  const places: GooglePlace[] = [];
  let allFailed = true;
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    allFailed = false;
    for (const p of result.value) {
      if (p.id && p.location && !seen.has(p.id)) {
        seen.add(p.id);
        places.push(p);
      }
    }
  }

  // Surface a real error only when every request failed (bad key, quota…)
  if (allFailed) {
    const firstError = results.find(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    throw firstError?.reason ?? new Error("Places search failed");
  }

  return places
    .map((p) => {
      const lat = p.location!.latitude;
      const lng = p.location!.longitude;
      const priceText = p.priceLevel ? PRICE_TEXT[p.priceLevel] : undefined;
      const openNow = p.currentOpeningHours?.openNow;

      const bar: AppBat = {
        id: p.id,
        name: p.displayName?.text || "Unknown Bar",
        rating: p.rating ?? 0,
        distance: milesBetween(centerLat, centerLng, lat, lng),
        location: { type: "Point", coordinates: [lng, lat] },
        ...(p.userRatingCount !== undefined && {
          userRatingCount: p.userRatingCount,
        }),
        ...(p.formattedAddress && { address: p.formattedAddress }),
        ...(openNow !== undefined && { openNow }),
        ...(priceText && { priceText }),
      };
      return bar;
    })
    // Drop unrated, review-less entries — these are almost always junk
    // user-created POIs, not operating bars
    .filter((b) => b.rating > 0 || (b.userRatingCount ?? 0) > 0)
    .sort((a, b) => a.distance - b.distance);
};
