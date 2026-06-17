// api/_lib/places.ts
//
// Server-side Google Places (New) calls. The API key is read from a NON-public
// env var (GOOGLE_PLACES_API_KEY) and never leaves the serverless runtime.
// This mirrors the shape the client used to build directly, so the browser
// payloads are unchanged.

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchNearby";
const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

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

const PRICE_TEXT: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

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

// Matches the client's AppBat shape (subset the importer/list consume).
export interface Bar {
  id: string;
  name: string;
  rating: number;
  distance: number;
  location: { type: "Point"; coordinates: [number, number] };
  userRatingCount?: number;
  address?: string;
  openNow?: boolean;
  priceText?: string;
}

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

const key = (): string => {
  const k = process.env.GOOGLE_PLACES_API_KEY;
  if (!k) throw new Error("GOOGLE_PLACES_API_KEY env var is not set");
  return k;
};

const toBar = (
  p: GooglePlace,
  centerLat: number,
  centerLng: number
): Bar | null => {
  if (!p.id || !p.location) return null;
  const lat = p.location.latitude;
  const lng = p.location.longitude;
  const priceText = p.priceLevel ? PRICE_TEXT[p.priceLevel] : undefined;
  const openNow = p.currentOpeningHours?.openNow;
  return {
    id: p.id,
    name: p.displayName?.text || "Unknown Bar",
    rating: p.rating ?? 0,
    distance: milesBetween(centerLat, centerLng, lat, lng),
    location: { type: "Point", coordinates: [lng, lat] },
    ...(p.userRatingCount !== undefined && { userRatingCount: p.userRatingCount }),
    ...(p.formattedAddress && { address: p.formattedAddress }),
    ...(openNow !== undefined && { openNow }),
    ...(priceText && { priceText }),
  };
};

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
      "X-Goog-Api-Key": key(),
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
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
  const data = (await response.json()) as { places?: GooglePlace[] };
  return data.places ?? [];
};

/** Fan-out 4 category/rank searches, dedupe, filter junk POIs, sort by distance. */
export const fetchNearbyBars = async (
  centerLat: number,
  centerLng: number,
  radiusMeters: number
): Promise<Bar[]> => {
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
  const bars: Bar[] = [];
  let allFailed = true;
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    allFailed = false;
    for (const p of result.value) {
      if (p.id && !seen.has(p.id)) {
        seen.add(p.id);
        const bar = toBar(p, centerLat, centerLng);
        if (bar) bars.push(bar);
      }
    }
  }

  if (allFailed) {
    const firstError = results.find(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    throw firstError?.reason ?? new Error("Places search failed");
  }

  return bars
    .filter((b) => b.rating > 0 || (b.userRatingCount ?? 0) > 0)
    .sort((a, b) => a.distance - b.distance);
};

/** Resolve one free-text line to its best matching place (bar-list importer). */
export const searchPlaceByText = async (
  query: string,
  bias?: { lat: number; lng: number }
): Promise<Bar | null> => {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const body: Record<string, unknown> = { textQuery: trimmed, maxResultCount: 1 };
  if (bias) {
    body.locationBias = {
      circle: {
        center: { latitude: bias.lat, longitude: bias.lng },
        radius: 50000,
      },
    };
  }

  const response = await fetch(TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key(),
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Places text search ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { places?: GooglePlace[] };
  const p = data.places?.[0];
  if (!p || !p.location) return null;

  const bar = toBar(p, p.location.latitude, p.location.longitude);
  if (bar) {
    bar.name = p.displayName?.text || trimmed;
    bar.distance = 0;
  }
  return bar;
};
